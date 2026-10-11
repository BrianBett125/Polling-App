import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveRefresh } from '@/components/LiveRefresh';
import { LocalTime } from '@/components/LocalTime';
import { PollAdminBar } from '@/components/PollAdminBar';
import { ResultsList } from '@/components/ResultsList';
import { ShareCard } from '@/components/ShareCard';
import { VoteForm } from '@/components/VoteForm';
import { getPublicPoll, optionsForResults } from '@/lib/poll-view';
import { isUuid } from '@/lib/route-protection';
import { getComponentSupabase } from '@/lib/supabase-server';
import { getVoteStatus } from '@/lib/vote-status';

// Public page: anyone with the link can view and vote. Depends on cookies, so never cached.
export const dynamic = 'force-dynamic';

export default async function PollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await getComponentSupabase();
  // get_poll is the only public read path. It withholds vote counts when the owner chose "after close".
  const [{ poll, error }, userResult, status] = await Promise.all([
    getPublicPoll(supabase, id),
    supabase.auth.getUser(),
    getVoteStatus(id),
  ]);

  if (error) {
    console.error('Error loading poll:', { code: error.code, message: error.message });
    return (
      <div className="max-w-2xl mx-auto space-y-4" role="alert">
        <h1 className="text-2xl font-semibold">We could not load this poll</h1>
        <p className="text-muted-foreground">Something went wrong on our side. Reload the page to try again.</p>
      </div>
    );
  }
  // Deleted or never existed.
  if (!poll) notFound();

  const user = userResult.data.user;
  const options = [...poll.options].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const resultOptions = optionsForResults({ ...poll, options });
  // Counts only exist in the page when they are visible; the hidden case never reaches this sum.
  const total = poll.results_hidden ? 0 : resultOptions.reduce((sum, o) => sum + o.votes, 0);
  const closedByTime = poll.is_closed && !poll.closed_at;
  const closedAt = poll.closed_at ?? poll.closes_at;

  const resultsTitle = poll.results_hidden
    ? status.hasVoted
      ? 'Thanks for voting'
      : 'Results'
    : poll.is_closed
      ? 'Final results'
      : status.hasVoted
        ? 'Thanks for voting. Results so far'
        : 'Results';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold break-words min-w-0">{poll.title}</h1>
        {poll.description && <p className="text-muted-foreground whitespace-pre-line break-words">{poll.description}</p>}
      </div>

      {poll.is_owner && <PollAdminBar pollId={poll.id} isClosed={poll.is_closed} closedByTime={closedByTime} />}

      {poll.is_closed ? (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Voting closed</p>
          {closedAt && (
            <p>
              Closed <LocalTime iso={closedAt} />
            </p>
          )}
        </div>
      ) : (
        poll.closes_at && (
          <p className="text-sm text-muted-foreground">
            Closes <LocalTime iso={poll.closes_at} />
          </p>
        )
      )}

      {options.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">This poll has no options to vote on.</CardContent>
        </Card>
      ) : (
        <>
          {!poll.is_closed && !status.hasVoted && (
            <Card>
              <CardHeader>
                <CardTitle>Choose one option</CardTitle>
              </CardHeader>
              <CardContent>
                <VoteForm
                  pollId={poll.id}
                  options={options.map(({ id, text }) => ({ id, text }))}
                  requireLogin={poll.require_login}
                  signedIn={!!user}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{resultsTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {poll.results_hidden ? (
                <p className="text-sm text-muted-foreground">Results will be shown when voting closes.</p>
              ) : (
                <ResultsList options={resultOptions} yourOptionId={status.optionId} />
              )}
              <LiveRefresh enabled={!poll.is_closed} total={total} />
            </CardContent>
          </Card>
        </>
      )}

      <ShareCard path={`/polls/${poll.id}`} title={poll.title} />
    </div>
  );
}
