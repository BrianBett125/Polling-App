import { computeResults, formatVotes, type ResultInput } from '@/lib/results';

interface ResultsListProps {
  options: ResultInput[];
  /** Option this browser voted for, marked in the list. */
  yourOptionId?: string | null;
}

/** Vote counts and percentages per option. Works without JavaScript and reads clearly to screen readers. */
export function ResultsList({ options, yourOptionId }: ResultsListProps) {
  const { total, rows } = computeResults(options);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">This poll has no options.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? 'No votes yet. Be the first to vote.' : `${formatVotes(total)} in total`}
      </p>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium break-words min-w-0">
                {row.text}
                {yourOptionId === row.id && (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary">Your vote</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatVotes(row.votes)} · {row.percent}%
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`${row.text}: ${row.percent}% of votes`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.percent}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${row.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
