import Link from 'next/link';
import { BarChart3, Plus, Search, SearchX } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { DeletePollButton } from '@/components/DeletePollButton';
import { getComponentSupabase } from '@/lib/supabase-server';
import { formatVotes } from '@/lib/results';
import {
  clampPage,
  dashboardHref,
  ilikePattern,
  pageRange,
  parsePage,
  parseSearch,
  pollBadges,
  totalPages,
} from '@/lib/dashboard-query';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, title, total_votes, created_at, closes_at, closed_at, require_login';
const createdFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// PostgREST answers 416 with this code when the requested range starts past the last row.
const RANGE_NOT_SATISFIABLE = 'PGRST103';

const badgeClass = {
  closed: 'border-transparent bg-warning-soft text-warning',
  closes: 'border-transparent bg-secondary text-secondary-foreground',
  login: 'border-transparent bg-accent text-accent-foreground',
} as const;

/**
 * The signed-in creator's own polls, with title search (?q=) and pagination (?page=).
 * Middleware already blocks signed-out visitors; this re-checks.
 */
export default async function PollsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const requestedPage = parsePage(sp.page);

  const supabase = await getComponentSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth?next=/polls');

  const base = () => {
    let query = supabase
      .from('polls_with_totals')
      .select(COLUMNS, { count: 'exact' })
      .eq('created_by', user.id);
    if (q) query = query.ilike('title', ilikePattern(q));
    return query;
  };

  const { from, to } = pageRange(requestedPage);
  // id as a tiebreaker keeps pages stable when several polls share a created_at.
  const { data: polls, count, error } = await base()
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to);

  if (error && error.code === RANGE_NOT_SATISFIABLE) {
    // Page number beyond the end: count the matches and send the visitor to the last page.
    const { count: total } = await base().range(0, 0);
    redirect(dashboardHref(q, clampPage(requestedPage, totalPages(total ?? 0))));
  }
  if (error) console.error('Error loading polls:', { code: error.code, message: error.message });

  const total = count ?? 0;
  const pages = totalPages(total);
  if (!error && requestedPage > pages) redirect(dashboardHref(q, pages));
  const page = clampPage(requestedPage, pages);
  const now = new Date();

  return (
    <div className="space-y-8">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">My polls</h1>
          <p className="mt-2 text-lg text-muted-foreground">Every question you have asked, in one place.</p>
        </div>
        <Button size="lg" asChild>
          <Link href="/polls/new">
            <Plus className="size-4" aria-hidden="true" /> Create poll
          </Link>
        </Button>
      </div>

      <form action="/polls" method="get" role="search" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
          <label htmlFor="poll-search" className="text-sm font-semibold">
            Search polls by title
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="poll-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder="Search…"
              className="h-11 w-full rounded-xl border border-input bg-card/80 pl-10 pr-3.5 text-sm shadow-sm transition-colors hover:border-primary/40"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href="/polls">Clear search</Link>
          </Button>
        )}
      </form>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          We could not load your polls. Reload the page to try again.
        </div>
      ) : !polls || polls.length === 0 ? (
        q ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
              <SearchX className="size-7" aria-hidden="true" />
            </span>
            <p className="text-lg font-semibold">No polls match &quot;{q}&quot;.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/polls">Clear search</Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <span className="bg-brand mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl text-white shadow-soft">
              <BarChart3 className="size-8" aria-hidden="true" />
            </span>
            <p className="font-display text-2xl font-extrabold">Your first poll is one minute away</p>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">You have not created any polls yet. Write a question, share the link, and watch the votes come in.</p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/polls/new">Create your first poll</Link>
            </Button>
          </div>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {q ? `${total} ${total === 1 ? 'poll matches' : 'polls match'} "${q}"` : `${total} ${total === 1 ? 'poll' : 'polls'}`}
          </p>
          <ul className="grid list-none gap-5 p-0 md:grid-cols-2 lg:grid-cols-3">
            {polls.map((poll) => {
              const badges = pollBadges(poll, now);
              return (
                <li key={poll.id} className="contents">
                  <Card className="animate-fade-up flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                    <div aria-hidden="true" className={`h-1.5 w-full ${badges.some((b) => b.key === 'closed') ? 'bg-amber-400' : 'bg-brand'}`} />
                    <CardHeader>
                      <h2 className="line-clamp-2 min-h-[3.25rem] break-words text-xl font-bold leading-snug tracking-tight">{poll.title}</h2>
                      <ul className="flex list-none flex-wrap gap-1.5 p-0 pt-1" aria-label="Poll status">
                          {!badges.some((b) => b.key === 'closed') && (
                            <li className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                              <span aria-hidden="true" className="size-1.5 rounded-full bg-success" /> Open
                            </li>
                          )}
                          {badges.map((b) => (
                            <li key={b.key} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass[b.key]}`}>
                              {b.label}
                            </li>
                          ))}
                        </ul>
                      <p className="pt-1 text-xs text-muted-foreground">Created {createdFmt.format(new Date(poll.created_at))}</p>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <p className="flex items-baseline gap-2">
                        <span className="font-display text-4xl font-extrabold tabular-nums leading-none" style={{ fontFamily: 'var(--font-bricolage), system-ui, sans-serif' }}>
                          {poll.total_votes ?? 0}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">{(poll.total_votes ?? 0) === 1 ? 'vote' : 'votes'}</span>
                      </p>
                    </CardContent>
                    <CardFooter className="flex flex-wrap gap-2">
                      <Button variant="outline" asChild className="flex-1">
                        <Link href={`/polls/${poll.id}`}>View &amp; share</Link>
                      </Button>
                      <Button variant="secondary" asChild className="flex-1">
                        <Link href={`/polls/${poll.id}/edit`}>Edit</Link>
                      </Button>
                      <DeletePollButton pollId={poll.id} className="flex-1" />
                    </CardFooter>
                  </Card>
                </li>
              );
            })}
          </ul>

          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
              {page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={dashboardHref(q, page - 1)} rel="prev">
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled aria-disabled="true">
                  Previous
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Button asChild variant="outline">
                  <Link href={dashboardHref(q, page + 1)} rel="next">
                    Next
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled aria-disabled="true">
                  Next
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
