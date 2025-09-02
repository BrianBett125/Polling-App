-- Enable required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-------------------------------
-- Create tables
-------------------------------

-- Polls table
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Poll options table
CREATE TABLE IF NOT EXISTS public.poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    votes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Votes table
CREATE TABLE IF NOT EXISTS public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
    option_id UUID REFERENCES public.poll_options(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_poll_vote UNIQUE (poll_id, user_id) NULLS NOT DISTINCT,
    CONSTRAINT unique_ip_poll_vote UNIQUE (poll_id, ip_address) NULLS NOT DISTINCT,
    CONSTRAINT user_or_ip_required CHECK (user_id IS NOT NULL OR ip_address IS NOT NULL)
);

-------------------------------
-- Enable RLS
-------------------------------
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-------------------------------
-- RLS Policies
-------------------------------

-- Polls
CREATE POLICY polls_select ON public.polls FOR SELECT USING (true);
CREATE POLICY polls_insert ON public.polls FOR INSERT 
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY polls_update ON public.polls FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY polls_delete ON public.polls FOR DELETE USING (auth.uid() = created_by);

-- Poll options
CREATE POLICY poll_options_select ON public.poll_options FOR SELECT USING (true);
CREATE POLICY poll_options_insert ON public.poll_options FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.polls 
        WHERE id = poll_options.poll_id AND (created_by = auth.uid() OR created_by IS NULL)
    ));
CREATE POLICY poll_options_update ON public.poll_options FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM public.polls 
        WHERE id = poll_options.poll_id AND created_by = auth.uid()
    ));

-- Votes
CREATE POLICY votes_select ON public.votes FOR SELECT USING (true);
CREATE POLICY votes_insert ON public.votes FOR INSERT
    WITH CHECK (
        (auth.uid() = user_id) OR 
        (auth.uid() IS NULL AND ip_address IS NOT NULL)
    );

-------------------------------
-- Indexes
-------------------------------
CREATE INDEX IF NOT EXISTS idx_votes_poll_id ON public.votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_votes_option_id ON public.votes(option_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON public.poll_options(poll_id);

-------------------------------
-- Atomic, concurrency-safe vote function
-------------------------------
CREATE OR REPLACE FUNCTION vote_for_option(
    p_option_id UUID, 
    p_poll_id UUID, 
    p_ip_address TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_vote_id UUID;
BEGIN
    -- Secure search_path
    SET LOCAL search_path = public, pg_catalog;

    -- Get current authenticated user ID
    v_user_id := auth.uid();

    -- Lock the poll row to prevent race conditions
    PERFORM 1 FROM public.polls WHERE id = p_poll_id FOR UPDATE;

    -- Check if the user or IP has already voted
    IF v_user_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.votes WHERE poll_id = p_poll_id AND user_id = v_user_id) THEN
            RAISE EXCEPTION 'You have already voted on this poll';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM public.votes WHERE poll_id = p_poll_id AND ip_address = p_ip_address) THEN
            RAISE EXCEPTION 'This IP address has already voted on this poll';
        END IF;
    END IF;

    -- Insert the vote
    INSERT INTO public.votes (poll_id, option_id, user_id, ip_address)
    VALUES (
        p_poll_id,
        p_option_id,
        v_user_id,
        CASE WHEN v_user_id IS NULL THEN p_ip_address ELSE NULL END
    )
    RETURNING id INTO v_vote_id;

    -- Increment the vote count safely
    UPDATE public.poll_options
    SET votes = votes + 1
    WHERE id = p_option_id;

    RETURN v_vote_id;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'You have already voted on this poll';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error recording vote: %', SQLERRM;
END;
$$;