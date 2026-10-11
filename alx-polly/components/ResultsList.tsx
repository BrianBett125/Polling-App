import { Check, Crown, Trophy } from 'lucide-react';
import { computeResults, formatVotes, type ResultInput } from '@/lib/results';

interface ResultsListProps {
  options: ResultInput[];
  /** Option this browser voted for, marked in the list. */
  yourOptionId?: string | null;
  /** Voting has ended: the leader is shown as the winner. */
  closed?: boolean;
}

/**
 * Vote counts and percentages per option. Works without JavaScript and reads clearly to screen readers.
 * Live announcements of changing totals come from LiveRefresh. Hidden results are handled by the page,
 * which does not render this list at all while the owner has results set to "after close".
 */
export function ResultsList({ options, yourOptionId, closed = false }: ResultsListProps) {
  const { total, rows } = computeResults(options);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">This poll has no options.</p>;
  }

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-8 text-center">
        <span className="bg-brand mx-auto mb-3 flex size-11 items-center justify-center rounded-xl text-white shadow-soft">
          <Crown className="size-5" aria-hidden="true" />
        </span>
        <p className="font-semibold">No votes yet. Be the first to vote.</p>
        <p className="mt-1 text-sm text-muted-foreground">Results appear here as soon as the first vote comes in.</p>
        {/* Option names stay readable to assistive tech and to anyone scanning the page. */}
        <ul className="sr-only">
          {rows.map((r) => (
            <li key={r.id}>{r.text}: 0 votes</li>
          ))}
        </ul>
      </div>
    );
  }

  const top = Math.max(...rows.map((r) => r.votes));

  return (
    <div className="space-y-5">
      <p className="inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-semibold text-secondary-foreground">
        {`${formatVotes(total)} in total`}
      </p>
      <ul className="space-y-3">
        {rows.map((row, i) => {
          const leading = row.votes === top;
          const mine = yourOptionId === row.id;
          return (
            <li
              key={row.id}
              className={`animate-fade-up rounded-2xl border p-4 transition-colors ${
                mine
                  ? 'border-success/60 bg-success-soft ring-1 ring-success/30'
                  : leading
                    ? 'border-primary/40 bg-accent/50'
                    : 'border-border bg-card'
              }`}
              style={{ '--delay': `${i * 0.05}s` } as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <p className="break-words font-semibold leading-snug">{row.text}</p>
                  {leading && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                      {closed ? <Trophy className="size-3" aria-hidden="true" /> : <Crown className="size-3" aria-hidden="true" />}
                      {closed ? 'Winner' : 'Leading'}
                    </span>
                  )}
                  {mine && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-success-soft">
                      <Check className="size-3" aria-hidden="true" /> Your vote
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-2xl font-extrabold tabular-nums leading-none" style={{ fontFamily: 'var(--font-bricolage), system-ui, sans-serif' }}>
                    {row.percent}%
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatVotes(row.votes)}</p>
                </div>
              </div>
              <div
                className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`${row.text}: ${row.percent}% of votes`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={row.percent}
              >
                <div
                  className={`animate-bar h-full rounded-full ${leading || mine ? 'bg-brand' : 'bg-primary/55 dark:bg-primary/70'}`}
                  style={{ width: `${row.percent}%`, '--delay': `${0.15 + i * 0.07}s` } as React.CSSProperties}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
