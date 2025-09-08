import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/protected-route';
import VoteForm from './vote-button';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/database.types';
import { voteForOption } from '@/lib/actions';

export default async function PollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch poll and options from Supabase
  const cookieStore = await cookies();
  const supabase = createServerComponentClient<Database>({ cookies: () => cookieStore });

  const { data: pollData, error } = await supabase
    .from('polls')
    .select('id, title, poll_options ( id, text, votes )')
    .eq('id', id)
    .single();

  if (error || !pollData) {
    return (
      <ProtectedRoute>
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Poll not found</h1>
        </div>
      </ProtectedRoute>
    );
  }

  const options = (pollData.poll_options ?? []).map((o: any) => ({ id: o.id as string, text: o.text as string, votes: (o.votes ?? 0) as number }));

  const vote = async (formData: FormData) => {
    'use server';
    const optionId = formData.get('option') as string | null;
    if (!optionId) return;
    const result = await voteForOption(optionId, id);
    if (!result.success) {
      throw new Error(result.error || 'Failed to vote');
    }
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{pollData.title}</h1>
          <p className="text-muted-foreground">Poll ID: {pollData.id}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Choose one option</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <VoteForm options={options} action={vote} />
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}