-- Browser-level voting, tighter RLS, atomic poll creation.
--
-- Forward-only and re-runnable: every statement is guarded, nothing is dropped
-- that holds user data. Replaces the IP-based vote identity from
-- 20250905_create_schema.sql, which (a) trusted the spoofable x-forwarded-for
-- header, (b) blocked unrelated voters behind one NAT, (c) let anyone read
-- every voter's IP via the public votes_select policy, and (d) never checked
-- that the chosen option belongs to the poll.
--
-- Data notes:
--   * votes rows are kept as-is, including legacy user_id / ip_address values.
--     Legacy rows have voter_token NULL, so a browser that voted before this
--     migration can vote once more (its old vote cannot be mapped to a browser).
--   * poll_options.votes is recomputed from the votes table (section 3). The
--     votes table is the record; the column is a cached count. Any legacy count
--     that never had a votes row behind it is corrected to the real number.

-------------------------------
-- 1. Vote identity: one vote per browser token per poll
-------------------------------
ALTER TABLE public.votes ADD COLUMN IF NOT EXISTS voter_token TEXT;

ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS unique_ip_poll_vote;
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS unique_user_poll_vote;
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS user_or_ip_required;

DO $$
BEGIN
  -- Legacy rows keep NULL tokens; NULLs are distinct, so they never collide.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'votes_poll_voter_token_key') THEN
    ALTER TABLE public.votes
      ADD CONSTRAINT votes_poll_voter_token_key UNIQUE (poll_id, voter_token);
  END IF;
  -- Token is the hex SHA-256 of the browser's secret cookie, computed by the server.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'votes_voter_token_format') THEN
    ALTER TABLE public.votes
      ADD CONSTRAINT votes_voter_token_format
      CHECK (voter_token IS NULL OR voter_token ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

-------------------------------
-- 2. A vote's option must belong to the vote's poll
-------------------------------
UPDATE public.poll_options SET votes = 0 WHERE votes IS NULL;
ALTER TABLE public.poll_options ALTER COLUMN votes SET DEFAULT 0;
ALTER TABLE public.poll_options ALTER COLUMN votes SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poll_options_poll_id_id_key') THEN
    ALTER TABLE public.poll_options
      ADD CONSTRAINT poll_options_poll_id_id_key UNIQUE (poll_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'votes_option_matches_poll') THEN
    ALTER TABLE public.votes
      ADD CONSTRAINT votes_option_matches_poll
      FOREIGN KEY (poll_id, option_id)
      REFERENCES public.poll_options (poll_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'votes_refs_not_null') THEN
    ALTER TABLE public.votes
      ADD CONSTRAINT votes_refs_not_null
      CHECK (poll_id IS NOT NULL AND option_id IS NOT NULL) NOT VALID;
  END IF;

  -- Enforced for all new rows immediately. Validate legacy rows only if they
  -- are clean; otherwise keep them and warn instead of failing the migration.
  BEGIN
    ALTER TABLE public.votes VALIDATE CONSTRAINT votes_option_matches_poll;
    ALTER TABLE public.votes VALIDATE CONSTRAINT votes_refs_not_null;
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN
    RAISE WARNING 'Legacy votes rows violate option/poll integrity; constraints apply to new rows only. Inspect: select * from votes v left join poll_options o on o.id = v.option_id and o.poll_id = v.poll_id where o.id is null;';
  END;
END $$;

-------------------------------
-- 3. Displayed totals derive from vote rows
-------------------------------
CREATE OR REPLACE FUNCTION public.sync_option_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Relative updates: each takes the option row lock and adds to the committed
  -- value, so concurrent voters cannot overwrite each other with a stale recount.
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE public.poll_options SET votes = votes - 1 WHERE id = OLD.option_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.poll_options SET votes = votes + 1 WHERE id = NEW.option_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_option_vote_count() FROM PUBLIC;

DROP TRIGGER IF EXISTS votes_sync_option_count ON public.votes;
CREATE TRIGGER votes_sync_option_count
  AFTER INSERT OR UPDATE OF option_id OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_option_vote_count();

UPDATE public.poll_options o
   SET votes = (SELECT count(*) FROM public.votes v WHERE v.option_id = o.id)
 WHERE o.votes IS DISTINCT FROM (SELECT count(*) FROM public.votes v WHERE v.option_id = o.id);

-------------------------------
-- 4. Stable option order, basic input limits, updated_at
-------------------------------
ALTER TABLE public.poll_options ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

UPDATE public.poll_options o
   SET position = r.rn
  FROM (
    SELECT id, (row_number() OVER (PARTITION BY poll_id ORDER BY created_at, id) - 1) AS rn
      FROM public.poll_options
  ) r
 WHERE o.id = r.id AND o.position = 0 AND r.rn <> 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polls_title_length') THEN
    ALTER TABLE public.polls
      ADD CONSTRAINT polls_title_length
      CHECK (char_length(btrim(title)) BETWEEN 1 AND 200) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polls_description_length') THEN
    ALTER TABLE public.polls
      ADD CONSTRAINT polls_description_length
      CHECK (description IS NULL OR char_length(description) <= 2000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poll_options_votes_nonneg') THEN
    ALTER TABLE public.poll_options
      ADD CONSTRAINT poll_options_votes_nonneg CHECK (votes >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poll_options_text_length') THEN
    ALTER TABLE public.poll_options
      ADD CONSTRAINT poll_options_text_length
      CHECK (char_length(btrim(text)) BETWEEN 1 AND 200) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS polls_touch_updated_at ON public.polls;
CREATE TRIGGER polls_touch_updated_at
  BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-------------------------------
-- 5. Row level security
-------------------------------
-- Votes are written only through cast_vote() by the server (service role) and
-- are never readable by browsers: they hold voter tokens and legacy IPs.
DROP POLICY IF EXISTS votes_select ON public.votes;
DROP POLICY IF EXISTS votes_insert ON public.votes;
REVOKE ALL ON public.votes FROM anon, authenticated;

-- Only signed-in users create polls, and only as themselves.
DROP POLICY IF EXISTS polls_insert ON public.polls;
CREATE POLICY polls_insert ON public.polls FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Owners can edit their own polls but cannot hand them to someone else.
DROP POLICY IF EXISTS polls_update ON public.polls;
CREATE POLICY polls_update ON public.polls FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Options are added only to polls the caller owns. No update policy: a
-- poll_options.votes edit by an owner would falsify results.
DROP POLICY IF EXISTS poll_options_insert ON public.poll_options;
CREATE POLICY poll_options_insert ON public.poll_options FOR INSERT
  WITH CHECK (votes = 0 AND EXISTS (
    SELECT 1 FROM public.polls p
     WHERE p.id = poll_options.poll_id AND p.created_by = auth.uid()
  ));
DROP POLICY IF EXISTS poll_options_update ON public.poll_options;

-------------------------------
-- 6. Voting RPC: server-only, trusts nothing from the caller's network identity
-------------------------------
-- The old function took a caller-supplied IP and was executable by anon.
DROP FUNCTION IF EXISTS public.vote_for_option(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.increment_vote(UUID);

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
BEGIN
  IF p_voter_token IS NULL OR p_voter_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_VOTER' USING ERRCODE = 'VT001';
  END IF;

  -- KEY SHARE blocks a concurrent poll delete until this vote commits.
  PERFORM 1 FROM public.polls WHERE id = p_poll_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POLL_NOT_FOUND' USING ERRCODE = 'VT003';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.poll_options WHERE id = p_option_id AND poll_id = p_poll_id
  ) THEN
    RAISE EXCEPTION 'INVALID_OPTION' USING ERRCODE = 'VT004';
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
-- 7. Atomic poll creation (runs as the caller, so RLS applies)
-------------------------------
CREATE OR REPLACE FUNCTION public.create_poll_with_options(
  p_title TEXT,
  p_description TEXT,
  p_options TEXT[]
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

  INSERT INTO public.polls (title, description, created_by)
  VALUES (v_title, nullif(btrim(coalesce(p_description, '')), ''), v_uid)
  RETURNING id INTO v_poll_id;

  INSERT INTO public.poll_options (poll_id, text, position)
  SELECT v_poll_id, o, (ord - 1)::int
    FROM unnest(v_options) WITH ORDINALITY AS t(o, ord);

  RETURN v_poll_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_poll_with_options(TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_poll_with_options(TEXT, TEXT, TEXT[]) TO authenticated;

-------------------------------
-- 8. Results view (unchanged shape; recreated so it exists on every path)
-------------------------------
CREATE OR REPLACE VIEW public.polls_with_totals AS
SELECT
  p.id,
  p.title,
  p.created_by,
  p.created_at,
  coalesce(sum(o.votes), 0)::int AS total_votes
FROM public.polls p
LEFT JOIN public.poll_options o ON o.poll_id = p.id
GROUP BY p.id, p.title, p.created_by, p.created_at;
GRANT SELECT ON public.polls_with_totals TO anon, authenticated;
