import Link from 'next/link';
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
// PostgREST answers 416 with this code when the requested range starts past the last row.
const RANGE_NOT_SATISFIABLE = 'PGRST103';

const badgeClass = {
  closed: 'border-foreground bg-foreground text-background',
  closes: 'border-border bg-secondary text-secondary-foreground',
  login: 'border-border bg-secondary text-secondary-foreground',
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My polls</h1>
        <Button asChild>
          <Link href="/polls/new">Create poll</Link>
        </Button>
      </div>

      <form action="/polls" method="get" role="search" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
          <label htmlFor="poll-search" className="text-sm font-medium">
            Search polls by title
          </label>
          <input
            id="poll-search"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Search…"
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
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
          <div className="py-10 text-center">
            <p className="text-muted-foreground">No polls match &quot;{q}&quot;.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/polls">Clear search</Link>
            </Button>
          </div>
        ) : (
          <div className="py-10 text-center">
            <p className="text-muted-foreground">You have not created any polls yet.</p>
            <Button asChild className="mt-4">
              <Link href="/polls/new">Create your first poll</Link>
            </Button>
          </div>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {q ? `${total} ${total === 1 ? 'poll matches' : 'polls match'} "${q}"` : `${total} ${total === 1 ? 'poll' : 'polls'}`}
          </p>
          <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
            {polls.map((poll) => {
              const badges = pollBadges(poll, now);
              return (
                <li key={poll.id} className="contents">
                  <Card>
                    <CardHeader>
                      <h2 className="line-clamp-2 break-words text-2xl font-semibold leading-none tracking-tight">{poll.title}</h2>
                      {badges.length > 0 && (
                        <ul className="flex list-none flex-wrap gap-1.5 p-0 pt-1" aria-label="Poll status">
                          {badges.map((b) => (
                            <li key={b.key} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass[b.key]}`}>
                              {b.label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{formatVotes(poll.total_votes ?? 0)}</p>
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
