import { describe, expect, it } from 'vitest';
import {
  clampPage,
  dashboardHref,
  escapeLike,
  ilikePattern,
  MAX_QUERY_LENGTH,
  PAGE_SIZE,
  pageRange,
  parsePage,
  pollBadges,
  parseSearch,
  totalPages,
} from './dashboard-query';

describe('escapeLike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
  });
  it('leaves ordinary text alone', () => {
    expect(escapeLike("Dinner? it's fine")).toBe("Dinner? it's fine");
  });
  it('wraps in wildcards after escaping', () => {
    expect(ilikePattern('50%')).toBe('%50\\%%');
  });
});

describe('parseSearch', () => {
  it('trims, collapses whitespace, takes first of repeats', () => {
    expect(parseSearch('  a   b ')).toBe('a b');
    expect(parseSearch(['x', 'y'])).toBe('x');
    expect(parseSearch(undefined)).toBe('');
    expect(parseSearch('   ')).toBe('');
  });
  it('caps length', () => {
    expect(Array.from(parseSearch('z'.repeat(1000))).length).toBe(MAX_QUERY_LENGTH);
  });
});

describe('parsePage', () => {
  it('parses valid pages', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage(['2', '9'])).toBe(2);
  });
  it('clamps junk to 1', () => {
    for (const v of [undefined, '', '0', '-2', '1.5', 'abc', '1e3', ' ', '99999999999999999999999']) {
      expect(parsePage(v)).toBe(1);
    }
  });
});

describe('pagination math', () => {
  it('totalPages is at least 1', () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(1)).toBe(1);
    expect(totalPages(PAGE_SIZE)).toBe(1);
    expect(totalPages(PAGE_SIZE + 1)).toBe(2);
    expect(totalPages(25)).toBe(3);
    expect(totalPages(NaN)).toBe(1);
  });
  it('clampPage keeps 1..pages', () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(5, 0)).toBe(1);
  });
  it('pageRange is inclusive and 12 wide', () => {
    expect(pageRange(1)).toEqual({ from: 0, to: 11 });
    expect(pageRange(2)).toEqual({ from: 12, to: 23 });
    expect(pageRange(3)).toEqual({ from: 24, to: 35 });
    expect(pageRange(-4)).toEqual({ from: 0, to: 11 });
  });
});

describe('pollBadges', () => {
  const now = new Date('2026-01-10T12:00:00Z');
  it('has none for a plain open poll', () => {
    expect(pollBadges({ closes_at: null, closed_at: null, require_login: false }, now)).toEqual([]);
    expect(pollBadges({}, now)).toEqual([]);
  });
  it('shows Closed for a manual close, with or without a future close time', () => {
    expect(pollBadges({ closed_at: '2026-01-01T00:00:00Z', closes_at: '2026-02-01T00:00:00Z' }, now).map((b) => b.label)).toEqual(['Closed']);
  });
  it('shows Closed once closes_at has passed', () => {
    expect(pollBadges({ closes_at: '2026-01-10T12:00:00Z' }, now).map((b) => b.label)).toEqual(['Closed']);
  });
  it('shows Closes <date> in UTC for a future close time', () => {
    expect(pollBadges({ closes_at: '2026-03-05T23:30:00Z' }, now)).toEqual([{ key: 'closes', label: 'Closes Mar 5, 2026' }]);
  });
  it('adds Sign-in required', () => {
    expect(pollBadges({ require_login: true, closes_at: '2026-03-05T00:00:00Z' }, now).map((b) => b.key)).toEqual(['closes', 'login']);
  });
  it('ignores an unparseable date', () => {
    expect(pollBadges({ closes_at: 'garbage' }, now)).toEqual([]);
  });
});

describe('dashboardHref', () => {
  it('omits defaults and keeps q', () => {
    expect(dashboardHref('', 1)).toBe('/polls');
    expect(dashboardHref('', 2)).toBe('/polls?page=2');
    expect(dashboardHref('lunch', 1)).toBe('/polls?q=lunch');
    expect(dashboardHref('a&b=c', 3)).toBe('/polls?q=a%26b%3Dc&page=3');
  });
});
