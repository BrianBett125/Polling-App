-- Robustness release: poll lifecycle, unlisted polls, login-only polls, rate limiting, account deletion.
--
-- Forward-only and re-runnable. No user rows are dropped. Summary:
--   1. polls gains closes_at, closed_at, require_login, results_visibility.
--   2. Polls are no longer enumerable through the public API. The share link is the only gate:
--      anon can no longer SELECT polls/poll_options, and the public page reads one poll by id through
--      get_poll(), which hides vote counts when the owner asked for results after close.
--   3. polls_with_totals runs with the caller's rights (security_invoker), so the dashboard view
--      only returns the signed-in owner's polls. Before, it ran as the view owner and listed every poll.
--   4. cast_vote refuses closed polls and, for login-only polls, anonymous voters and a second vote by
--      the same account from another browser.
--   5. replace_poll_options lets the owner rewrite options until the first vote.
--   6. check_rate_limit: fixed-window counters in Postgres (serverless friendly), service role only.
--   7. Deleting an auth user deletes their polls (and with them options and votes); their own votes on
--      other people's polls stay, with the account link removed.

-------------------------------
-- 1. Poll lifecycle and voting rules
-------------------------------
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS require_login BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS results_visibility TEXT NOT NULL DEFAULT 'always';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polls_results_visibility_check') THEN
    ALTER TABLE public.polls
      ADD CONSTRAINT polls_results_visibility_check
      CHECK (results_visibility IN ('always', 'after_close'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS votes_poll_user_idx ON public.votes (poll_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS polls_created_by_created_at_idx ON public.polls (created_by, created_at DESC);

-------------------------------
-- 2. Account deletion: foreign keys that let an auth user be removed
-------------------------------
ALTER TABLE public.polls DROP CONSTRAINT IF EXISTS polls_created_by_fkey;
ALTER TABLE public.polls
  ADD CONSTRAINT polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_user_id_fkey;
ALTER TABLE public.votes
  ADD CONSTRAINT votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE SET NULL;

-------------------------------
-- 3. Unlisted polls: no enumeration through the public API
-------------------------------
DROP POLICY IF EXISTS polls_select ON public.polls;
CREATE POLICY polls_select ON public.polls FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS poll_options_select ON public.poll_options;
CREATE POLICY poll_options_select ON public.poll_options FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.polls p
     WHERE p.id = poll_options.poll_id AND p.created_by = auth.uid()
  ));

-- Dashboard view: the caller's own rights apply (needs PostgreSQL 15+, which Supabase runs).
DROP VIEW IF EXISTS public.polls_with_totals;
CREATE VIEW public.polls_with_totals
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.title,
  p.created_by,
  p.created_at,
  coalesce(sum(o.votes), 0)::int AS total_votes,
  p.closes_at,
  p.closed_at,
  p.require_login
FROM public.polls p
LEFT JOIN public.poll_options o ON o.poll_id = p.id
GROUP BY p.id, p.title, p.created_by, p.created_at, p.closes_at, p.closed_at, p.require_login;
REVOKE ALL ON public.polls_with_totals FROM PUBLIC, anon;
GRANT SELECT ON public.polls_with_totals TO authenticated, service_role;

-- One poll by id, for anyone holding the link. Vote counts are NULL while the owner has chosen
-- "results after close" and the poll is still open, except for the owner.
CREATE OR REPLACE FUNCTION public.get_poll(p_poll_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  p public.polls;
  v_closed BOOLEAN;
  v_owner BOOLEAN;
  v_hide BOOLEAN;
  v_opts JSONB;
BEGIN
  SELECT * INTO p FROM public.polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_closed := p.closed_at IS NOT NULL OR (p.closes_at IS NOT NULL AND p.closes_at <= now());
  -- auth.uid() is NULL for anonymous callers; without coalesce the NULL would flow into v_hide.
  v_owner := coalesce(p.created_by = auth.uid(), false);
  v_hide := p.results_visibility = 'after_close' AND NOT v_closed AND NOT v_owner;

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'id', o.id,
             'text', o.text,
             'position', o.position,
             'created_at', o.created_at,
             'votes', CASE WHEN v_hide THEN NULL ELSE o.votes END
           ) ORDER BY o.position, o.created_at, o.id), '[]'::jsonb)
    INTO v_opts
    FROM public.poll_options o
   WHERE o.poll_id = p.id;

  RETURN jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'created_by', CASE WHEN v_owner THEN p.created_by ELSE NULL END,
    'created_at', p.created_at,
    'closes_at', p.closes_at,
    'closed_at', p.closed_at,
    'is_closed', v_closed,
    'require_login', p.require_login,
    'results_visibility', p.results_visibility,
    'results_hidden', v_hide,
    'is_owner', v_owner,
    'options', v_opts
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_poll(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_poll(UUID) TO anon, authenticated, service_role;

-------------------------------
-- 4. cast_vote: closed polls, login-only polls
-------------------------------
CREATE OR REPLACE FUNCTION public.cast_vote(
  p_poll_id UUID,
  p_option_id UUID,
  p_voter_token TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_vote_id UUID;
  p public.polls;
BEGIN
  IF p_voter_token IS NULL OR p_voter_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_VOTER' USING ERRCODE = 'VT001';
  END IF;

  -- FOR SHARE conflicts with the option guard's and replace_poll_options' FOR NO KEY UPDATE, and with
  -- deletes, so "no vote yet" checks and a concurrent first vote serialise.
  SELECT * INTO p FROM public.polls WHERE id = p_poll_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POLL_NOT_FOUND' USING ERRCODE = 'VT003';
  END IF;

  IF p.closed_at IS NOT NULL OR (p.closes_at IS NOT NULL AND p.closes_at <= now()) THEN
    RAISE EXCEPTION 'POLL_CLOSED' USING ERRCODE = 'VT009';
  END IF;

  IF p.require_login AND p_user_id IS NULL THEN
    RAISE EXCEPTION 'LOGIN_REQUIRED' USING ERRCODE = 'VT010';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.poll_options WHERE id = p_option_id AND poll_id = p_poll_id
  ) THEN
    RAISE EXCEPTION 'INVALID_OPTION' USING ERRCODE = 'VT004';
  END IF;

  IF p.require_login THEN
    -- One vote per account on login-only polls, across browsers. The advisory lock closes the race
    -- between two simultaneous votes by the same account.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_poll_id::text || ':' || p_user_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.votes WHERE poll_id = p_poll_id AND user_id = p_user_id) THEN
      RAISE EXCEPTION 'ALREADY_VOTED' USING ERRCODE = 'VT002';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.votes (poll_id, option_id, user_id, voter_token)
    VALUES (p_poll_id, p_option_id, p_user_id, p_voter_token)
    RETURNING id INTO v_vote_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_VOTED' USING ERRCODE = 'VT002';
  END;

  RETURN v_vote_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) TO service_role;

-------------------------------
-- 5. Poll creation with settings, and option replacement before the first vote
-------------------------------
DROP FUNCTION IF EXISTS public.create_poll_with_options(TEXT, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.create_poll_with_options(
  p_title TEXT,
  p_description TEXT,
  p_options TEXT[],
  p_closes_at TIMESTAMPTZ DEFAULT NULL,
  p_require_login BOOLEAN DEFAULT false,
  p_results_visibility TEXT DEFAULT 'always'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_title TEXT := btrim(coalesce(p_title, ''));
  v_options TEXT[];
  v_poll_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'VT005';
  END IF;
  IF char_length(v_title) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE = 'VT006';
  END IF;
  IF p_results_visibility NOT IN ('always', 'after_close')
     OR (p_closes_at IS NOT NULL AND p_closes_at <= now()) THEN
    RAISE EXCEPTION 'INVALID_SETTINGS' USING ERRCODE = 'VT012';
  END IF;

  SELECT coalesce(array_agg(btrim(o) ORDER BY ord), '{}')
    INTO v_options
    FROM unnest(coalesce(p_options, '{}')) WITH ORDINALITY AS t(o, ord)
   WHERE btrim(o) <> '';

  IF coalesce(array_length(v_options, 1), 0) < 2 OR array_length(v_options, 1) > 20 THEN
    RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE = 'VT007';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_options) o WHERE char_length(o) > 200) THEN
    RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE = 'VT007';
  END IF;

  INSERT INTO public.polls (title, description, created_by, closes_at, require_login, results_visibility)
  VALUES (v_title, nullif(btrim(coalesce(p_description, '')), ''), v_uid,
          p_closes_at, coalesce(p_require_login, false), p_results_visibility)
  RETURNING id INTO v_poll_id;

  INSERT INTO public.poll_options (poll_id, text, position)
  SELECT v_poll_id, o, (ord - 1)::int
    FROM unnest(v_options) WITH ORDINALITY AS t(o, ord);

  RETURN v_poll_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_poll_with_options(TEXT, TEXT, TEXT[], TIMESTAMPTZ, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_poll_with_options(TEXT, TEXT, TEXT[], TIMESTAMPTZ, BOOLEAN, TEXT) TO authenticated;

-- Replaces all options of a poll the caller owns, only while it has no votes.
CREATE OR REPLACE FUNCTION public.replace_poll_options(p_poll_id UUID, p_options TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
  v_options TEXT[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'VT005';
  END IF;

  SELECT created_by INTO v_owner FROM public.polls WHERE id = p_poll_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE = 'VT011';
  END IF;
  IF EXISTS (SELECT 1 FROM public.votes WHERE poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'POLL_HAS_VOTES' USING ERRCODE = 'VT008';
  END IF;

  SELECT coalesce(array_agg(btrim(o) ORDER BY ord), '{}')
    INTO v_options
    FROM unnest(coalesce(p_options, '{}')) WITH ORDINALITY AS t(o, ord)
   WHERE btrim(o) <> '';
  IF coalesce(array_length(v_options, 1), 0) < 2 OR array_length(v_options, 1) > 20
     OR EXISTS (SELECT 1 FROM unnest(v_options) o WHERE char_length(o) > 200) THEN
    RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE = 'VT007';
  END IF;

  DELETE FROM public.poll_options WHERE poll_id = p_poll_id;
  INSERT INTO public.poll_options (poll_id, text, position)
  SELECT p_poll_id, o, (ord - 1)::int
    FROM unnest(v_options) WITH ORDINALITY AS t(o, ord);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_poll_options(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_poll_options(UUID, TEXT[]) TO authenticated;

-------------------------------
-- 6. Rate limiting (fixed window), server only
-------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;

-- Counts one hit for p_key and says whether it is still within p_limit per p_window_seconds.
-- Callers hash anything personal (such as an IP address) before it reaches this function.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key TEXT, p_limit INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_hits INTEGER;
BEGIN
  IF p_key IS NULL OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT' USING ERRCODE = 'VT013';
  END IF;
  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limits AS r (key, window_start, hits)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING r.hits INTO v_hits;

  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN v_hits <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-------------------------------
-- 7. Hardening found in review
-------------------------------
-- (a) The option guard from migration 4 ran BEFORE the row-level-security check, so a stranger could
-- insert into poll_options for any poll id and read the guard's error: VT008 meant "this poll has
-- votes", which defeats results_visibility = 'after_close'. As an AFTER INSERT trigger it runs only for
-- rows RLS already accepted (owners), and a failure still rolls the insert back. The row lock keeps the
-- same serialisation against voters. The count now includes the new row, hence > 20.
CREATE OR REPLACE FUNCTION public.guard_poll_option_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM 1 FROM public.polls WHERE id = NEW.poll_id FOR NO KEY UPDATE;

  IF EXISTS (SELECT 1 FROM public.votes WHERE poll_id = NEW.poll_id) THEN
    RAISE EXCEPTION 'POLL_HAS_VOTES' USING ERRCODE = 'VT008';
  END IF;
  IF (SELECT count(*) FROM public.poll_options WHERE poll_id = NEW.poll_id) > 20 THEN
    RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE = 'VT007';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_poll_option_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS poll_options_insert_guard ON public.poll_options;
CREATE TRIGGER poll_options_insert_guard
  AFTER INSERT ON public.poll_options
  FOR EACH ROW EXECUTE FUNCTION public.guard_poll_option_insert();

-- (b) Backstop for poll creation. The app limits 10 per hour per account; someone calling the API
-- directly with their own session skips the app, so the database caps it too.
CREATE OR REPLACE FUNCTION public.guard_poll_insert_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL
     AND (SELECT count(*) FROM public.polls
           WHERE created_by = NEW.created_by AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'VT014';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_poll_insert_rate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS polls_insert_rate_guard ON public.polls;
CREATE TRIGGER polls_insert_rate_guard
  BEFORE INSERT ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.guard_poll_insert_rate();
