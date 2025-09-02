-- Create votes table to track individual votes
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id UUID REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure we have either a user_id or ip_address
  CONSTRAINT votes_user_or_ip_check CHECK (
    (user_id IS NOT NULL) OR (ip_address IS NOT NULL)
  ),
  
  -- Prevent duplicate votes from the same user on the same poll
  CONSTRAINT votes_unique_user_poll UNIQUE (user_id, poll_id),
  
  -- Prevent duplicate votes from the same IP on the same poll (when no user_id)
  CONSTRAINT votes_unique_ip_poll UNIQUE (ip_address, poll_id) 
    WHERE user_id IS NULL
);

-- Enable Row Level Security
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Policies for votes table
CREATE POLICY "Votes are viewable by everyone" 
  ON public.votes FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert their own votes" 
  ON public.votes FOR INSERT 
  WITH CHECK (
    -- Authenticated users can vote with their user_id
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    -- Anonymous users can vote with their IP address
    (auth.uid() IS NULL AND ip_address IS NOT NULL)
  );

-- Create function to vote on a poll option
CREATE OR REPLACE FUNCTION vote_for_option(p_option_id UUID, p_poll_id UUID, p_ip_address TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_vote_id UUID;
BEGIN
  -- Get current user ID if authenticated
  v_user_id := auth.uid();
  
  -- Insert vote record
  INSERT INTO public.votes (poll_id, option_id, user_id, ip_address)
  VALUES (p_poll_id, p_option_id, v_user_id, 
    CASE WHEN v_user_id IS NULL THEN p_ip_address ELSE NULL END)
  RETURNING id INTO v_vote_id;
  
  -- Increment vote count on the option
  UPDATE public.poll_options
  SET votes = votes + 1
  WHERE id = p_option_id;
  
  RETURN v_vote_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'You have already voted on this poll';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to register vote: %', SQLERRM;
END;
$$;