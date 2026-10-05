import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResultsList } from '@/components/ResultsList';
import { ShareCard } from '@/components/ShareCard';
import { VoteForm } from '@/components/VoteForm';
import { isUuid } from '@/lib/route-protection';
import { getComponentSupabase } from '@/lib/supabase-server';
import { getVoteStatus } from '@/lib/vote-status';

// Public page: anyone with the link can view and vote. Depends on cookies, so never cached.
export const dynamic = 'force-dynamic';

export default async function PollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await getComponentSupabase();
  const { data: poll, error } = await supabase
    .from('polls')
    .select('id, title, description, created_by, poll_options ( id, text, votes, position, created_at )')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error loading poll:', { code: error.code, message: error.message });
    return (
      <div className="max-w-2xl mx-auto space-y-4" role="alert">
        <h1 className="text-2xl font-semibold">We could not load this poll</h1>
        <p className="text-muted-foreground">Something went wrong on our side. Reload the page to try again.</p>
      </div>
    );
  }
  // Deleted, never existed, or not visible: all look the same to a visitor.
  if (!poll) notFound();

  const options = [...(poll.poll_options ?? [])]
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((o) => ({ id: o.id, text: o.text, votes: o.votes }));

  const [status, userResult] = await Promise.all([getVoteStatus(id), supabase.auth.getUser()]);
  const isOwner = !!userResult.data.user && userResult.data.user.id === poll.created_by;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold break-words min-w-0">{poll.title}</h1>
          {isOwner && (
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <Link href={`/polls/${poll.id}/edit`}>Edit</Link>
            </Button>
          )}
        </div>
        {poll.description && <p className="text-muted-foreground whitespace-pre-line break-words">{poll.description}</p>}
      </div>

      {options.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">This poll has no options to vote on.</CardContent>
        </Card>
      ) : (
        <>
          {!status.hasVoted && (
            <Card>
              <CardHeader>
                <CardTitle>Choose one option</CardTitle>
              </CardHeader>
              <CardContent>
                <VoteForm pollId={poll.id} options={options.map(({ id, text }) => ({ id, text }))} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{status.hasVoted ? 'Thanks for voting. Results so far' : 'Results'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResultsList options={options} yourOptionId={status.optionId} />
            </CardContent>
          </Card>
        </>
      )}

      <ShareCard path={`/polls/${poll.id}`} title={poll.title} />
    </div>
  );
}
