import { describe, expect, it } from 'vitest';
import { computeResults, formatVotes } from './results';

const opt = (id: string, votes: number) => ({ id, text: id, votes });

describe('computeResults', () => {
  it('shows 0% for every option when there are no votes', () => {
    const r = computeResults([opt('a', 0), opt('b', 0)]);
    expect(r.total).toBe(0);
    expect(r.rows.map((x) => x.percent)).toEqual([0, 0]);
  });

  it('computes counts and percentages', () => {
    const r = computeResults([opt('a', 1), opt('b', 3)]);
    expect(r.total).toBe(4);
    expect(r.rows.map((x) => [x.votes, x.percent])).toEqual([[1, 25], [3, 75]]);
  });

  it('always sums to exactly 100 when anyone voted (largest remainder)', () => {
    const r = computeResults([opt('a', 1), opt('b', 1), opt('c', 1)]);
    expect(r.rows.map((x) => x.percent)).toEqual([34, 33, 33]);
    for (const votes of [[1, 2, 4], [7, 7, 7, 7, 7, 7, 7], [1, 0, 0, 999], [5, 5]]) {
      const sum = computeResults(votes.map((v, i) => opt(String(i), v))).rows.reduce((s, x) => s + x.percent, 0);
      expect(sum).toBe(100);
    }
  });

  it('gives a single-option poll 100%', () => {
    expect(computeResults([opt('a', 9)]).rows[0].percent).toBe(100);
  });

  it('treats negative, fractional and non-finite counts as safe numbers', () => {
    const r = computeResults([opt('a', -5), opt('b', 2.9), opt('c', Number.NaN)]);
    expect(r.total).toBe(2);
    expect(r.rows.map((x) => [x.votes, x.percent])).toEqual([[0, 0], [2, 100], [0, 0]]);
  });

  it('handles an empty option list', () => {
    expect(computeResults([])).toEqual({ total: 0, rows: [] });
  });

  it('keeps option order and does not mutate input', () => {
    const input = [opt('a', 1), opt('b', 2)];
    const copy = JSON.stringify(input);
    expect(computeResults(input).rows.map((x) => x.id)).toEqual(['a', 'b']);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe('formatVotes', () => {
  it('pluralizes', () => {
    expect([0, 1, 2].map(formatVotes)).toEqual(['0 votes', '1 vote', '2 votes']);
  });
});
