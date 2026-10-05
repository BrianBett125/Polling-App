export type ResultInput = { id: string; text: string; votes: number };
export type ResultRow = ResultInput & { percent: number };
export type Results = { total: number; rows: ResultRow[] };

/**
 * Vote counts to whole-number percentages that add up to exactly 100 when there
 * are votes (largest remainder method), and to 0 for every option when there
 * are none. Negative or non-finite counts are treated as 0.
 */
export function computeResults(options: ResultInput[]): Results {
  const counts = options.map((o) => (Number.isFinite(o.votes) && o.votes > 0 ? Math.floor(o.votes) : 0));
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return { total: 0, rows: options.map((o) => ({ ...o, votes: 0, percent: 0 })) };
  }

  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  let leftover = 100 - floors.reduce((a, b) => a + b, 0);
  // Hand out the remaining points to the largest fractional parts; ties go to the earlier option.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    floors[i] += 1;
    leftover -= 1;
  }

  return { total, rows: options.map((o, i) => ({ ...o, votes: counts[i], percent: floors[i] })) };
}

export function formatVotes(n: number): string {
  return `${n} ${n === 1 ? 'vote' : 'votes'}`;
}
