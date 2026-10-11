import { notFound } from 'next/navigation';
import { ChevronDown, Lock, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveRefresh } from '@/components/LiveRefresh';
import { LocalTime } from '@/components/LocalTime';
import { PollAdminBar } from '@/components/PollAdminBar';
import { ResultsList } from '@/components/ResultsList';
import { ShareCard } from '@/components/ShareCard';
import { VoteForm } from '@/components/VoteForm';
import { VoteThanks } from '@/components/VoteThanks';
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
      <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-border/70 bg-card p-8 text-center shadow-soft" role="alert">
        <h1 className="text-2xl font-bold">We could not load this poll</h1>
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
    ? 'Results'
    : poll.is_closed
      ? 'Final results'
      : status.hasVoted
        ? 'Results so far'
        : 'Results';

  const resultsContent = poll.results_hidden ? (
    <p className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">Results will be shown when voting closes.</p>
  ) : (
    <ResultsList options={resultOptions} yourOptionId={status.optionId} closed={poll.is_closed} />
  );
  // Before voting (and not as the owner) the results fold away so the options are the focus.
  const collapseResults = !poll.is_closed && !status.hasVoted && !poll.results_hidden && !poll.is_owner;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="animate-fade-up mb-8 space-y-4">
        <ul className="flex list-none flex-wrap items-center gap-2 p-0 text-xs font-semibold" aria-label="Poll status">
          <li
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
              poll.is_closed ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'
            }`}
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${poll.is_closed ? 'bg-warning' : 'bg-success'}`} />
            {poll.is_closed ? 'Voting closed' : 'Voting open'}
          </li>
          {poll.require_login && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-accent-foreground">
              <Lock className="size-3" aria-hidden="true" /> Sign-in required
            </li>
          )}
          {poll.results_hidden && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
              <ShieldCheck className="size-3" aria-hidden="true" /> Results after close
            </li>
          )}
          {!poll.is_closed && poll.closes_at && (
            <li className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
              Closes <LocalTime iso={poll.closes_at} />
            </li>
          )}
          {poll.is_closed && closedAt && (
            <li className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
              Closed <LocalTime iso={closedAt} />
            </li>
          )}
        </ul>
        <h1 className="min-w-0 text-balance break-words text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">{poll.title}</h1>
        {poll.description && (
          <p className="max-w-3xl text-pretty whitespace-pre-line break-words text-lg leading-relaxed text-muted-foreground">{poll.description}</p>
        )}
      </header>

      {poll.is_owner && (
        <div className="mb-6">
          <PollAdminBar pollId={poll.id} isClosed={poll.is_closed} closedByTime={closedByTime} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          {options.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">This poll has no options to vote on.</CardContent>
            </Card>
          ) : (
            <>
              {status.hasVoted && <VoteThanks closed={poll.is_closed} />}

              {!poll.is_closed && !status.hasVoted && (
                <section aria-labelledby="vote-title" className="animate-fade-up space-y-4">
                  <h2 id="vote-title" className="text-2xl font-extrabold tracking-tight">
                    Choose one option
                  </h2>
                  <VoteForm
                    pollId={poll.id}
                    options={options.map(({ id, text }) => ({ id, text }))}
                    requireLogin={poll.require_login}
                    signedIn={!!user}
                  />
                </section>
              )}

              {collapseResults ? (
                // Voters see the options first and are not nudged by the current leader; results are one tap away.
                <details className="group animate-fade-up rounded-2xl border border-border/70 bg-card shadow-soft" style={{ '--delay': '0.08s' } as React.CSSProperties}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-6 py-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
                    <span>See results without voting</span>
                    <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-4 px-6 pb-6">
                    {resultsContent}
                    <LiveRefresh enabled={!poll.is_closed} total={total} />
                  </div>
                </details>
              ) : (
                <Card className="animate-fade-up" style={{ '--delay': '0.08s' } as React.CSSProperties}>
                  <CardHeader>
                    <CardTitle>{resultsTitle}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {resultsContent}
                    <LiveRefresh enabled={!poll.is_closed} total={total} />
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <aside aria-label="Share" className="animate-fade-up lg:sticky lg:top-24" style={{ '--delay': '0.14s' } as React.CSSProperties}>
          <ShareCard path={`/polls/${poll.id}`} title={poll.title} />
        </aside>
      </div>
    </div>
  );
}
