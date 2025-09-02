import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase } from '@/lib/supabase';
import VoteButton from './vote-button';

// Fetch poll data from Supabase
async function getPollData(pollId: string) {
  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .select('id, title, description, created_by')
    .eq('id', pollId)
    .single();
  
  if (pollError) {
    console.error('Error fetching poll:', pollError);
    return null;
  }
  
  const { data: options, error: optionsError } = await supabase
    .from('poll_options')
    .select('id, text, votes')
    .eq('poll_id', pollId);
  
  if (optionsError) {
    console.error('Error fetching poll options:', optionsError);
    return null;
  }
  
  // Calculate total votes
  const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
  
  return {
    ...poll,
    options,
    totalVotes
  };
}

export default async function PollDetailPage({ params }: { params: { id: string } }) {
  const pollId = params.id;
  const poll = await getPollData(pollId) || {
    id: pollId,
    title: 'Poll not found',
    description: 'This poll does not exist or has been deleted.',
    options: [],
    totalVotes: 0
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{poll.title}</h1>
          <p className="text-muted-foreground">{poll.description}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Vote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {poll.options.map((option) => (
              <div key={option.id} className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <div className="font-medium">{option.text}</div>
                  <div className="text-sm text-muted-foreground">{option.votes} votes</div>
                </div>
                <VoteButton optionId={option.id} pollId={poll.id} />
              </div>
            ))}

            <div className="pt-4 border-t">
              <div className="text-sm text-muted-foreground">Total votes: {poll.totalVotes}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}