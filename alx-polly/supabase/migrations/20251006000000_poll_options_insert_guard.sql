-- Direct option inserts (an owner calling the API with the public key) bypass the limits that
-- create_poll_with_options enforces, and adding options after voting has started silently changes
-- everyone's percentages. Guard the table itself.
--
-- Forward-only, re-runnable, touches no existing rows. Polls that already have more than 20
-- options or votes are left alone; only new inserts are checked.

CREATE OR REPLACE FUNCTION public.guard_poll_option_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- needs to read votes, which browser roles cannot
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Serialise option inserts per poll (does not block voters, who take KEY SHARE).
  PERFORM 1 FROM public.polls WHERE id = NEW.poll_id FOR NO KEY UPDATE;

  IF EXISTS (SELECT 1 FROM public.votes WHERE poll_id = NEW.poll_id) THEN
    RAISE EXCEPTION 'POLL_HAS_VOTES' USING ERRCODE = 'VT008';
  END IF;
  IF (SELECT count(*) FROM public.poll_options WHERE poll_id = NEW.poll_id) >= 20 THEN
    RAISE EXCEPTION 'INVALID_OPTIONS' USING ERRCODE = 'VT007';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_poll_option_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS poll_options_insert_guard ON public.poll_options;
CREATE TRIGGER poll_options_insert_guard
  BEFORE INSERT ON public.poll_options
  FOR EACH ROW EXECUTE FUNCTION public.guard_poll_option_insert();

-- The "no options after voting starts" rule must hold under concurrency. Voters used FOR KEY SHARE
-- on the poll row, which does not conflict with the guard's FOR NO KEY UPDATE, so an option insert
-- could check "no votes yet", a vote could commit, and the option could still land. FOR SHARE
-- conflicts with it (and with deletes), so the two serialise: whichever comes second sees the other.
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

  PERFORM 1 FROM public.polls WHERE id = p_poll_id FOR SHARE;
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
