-- Create polls table
CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create poll options table
CREATE TABLE IF NOT EXISTS public.poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  votes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;

-- Policies for polls table
CREATE POLICY "Polls are viewable by everyone" 
  ON public.polls FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert their own polls" 
  ON public.polls FOR INSERT 
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own polls" 
  ON public.polls FOR UPDATE 
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own polls" 
  ON public.polls FOR DELETE 
  USING (auth.uid() = created_by);

-- Policies for poll_options table
CREATE POLICY "Poll options are viewable by everyone" 
  ON public.poll_options FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert options for their own polls" 
  ON public.poll_options FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.polls 
    WHERE id = poll_options.poll_id AND created_by = auth.uid()
  ));

CREATE POLICY "Users can update options for their own polls" 
  ON public.poll_options FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.polls 
    WHERE id = poll_options.poll_id AND created_by = auth.uid()
  ));

-- Create function to increment votes
CREATE OR REPLACE FUNCTION increment_vote(option_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.poll_options
  SET votes = votes + 1
  WHERE id = option_id;
END;
$$;