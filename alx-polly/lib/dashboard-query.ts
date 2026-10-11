/** Pure helpers for the "My polls" dashboard: search escaping, pagination math, link building. */

export const PAGE_SIZE = 12;
export const MAX_QUERY_LENGTH = 100;

type Param = string | string[] | undefined;

const first = (v: Param): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Escapes `\`, `%` and `_` so user text is matched literally inside an ILIKE pattern. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%text%` pattern for `.ilike('title', pattern)`, with the user's text escaped. */
export function ilikePattern(input: string): string {
  return `%${escapeLike(input)}%`;
}

/** Search text from the URL: first value, trimmed, whitespace collapsed, capped. Empty string when absent. */
export function parseSearch(raw: Param): string {
  const v = first(raw);
  if (!v) return '';
  return Array.from(v.replace(/\s+/g, ' ').trim())
    .slice(0, MAX_QUERY_LENGTH)
    .join('')
    .trim();
}

/** Page number from the URL. Missing, non-numeric, fractional, zero or negative all give 1. */
export function parsePage(raw: Param): number {
  const v = first(raw);
  if (!v || !/^\d+$/.test(v.trim())) return 1;
  const n = Number(v.trim());
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/** Number of pages for `total` rows. Always at least 1 so "Page 1 of 1" renders for an empty list. */
export function totalPages(total: number, pageSize = PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Clamps a requested page into 1..pages. */
export function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pages));
}

/** Inclusive row range for PostgREST `.range(from, to)`. */
export function pageRange(page: number, pageSize = PAGE_SIZE): { from: number; to: number } {
  const from = (Math.max(1, page) - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** Dashboard URL for a page, keeping the search. Page 1 omits `page` for a clean URL. */
export function dashboardHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const s = params.toString();
  return s ? `/polls?${s}` : '/polls';
}

export type PollBadge = { key: 'closed' | 'closes' | 'login'; label: string };

type BadgeInput = { closes_at?: string | null; closed_at?: string | null; require_login?: boolean | null };

const dateFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Status badges for a dashboard card. "Closed" when closed by hand or the close time has passed;
 * otherwise "Closes <date>" (UTC, so server and browser agree) when a close time is set;
 * plus "Sign-in required" for login-only polls. Unparseable dates are ignored.
 */
export function pollBadges(poll: BadgeInput, now: Date = new Date()): PollBadge[] {
  const out: PollBadge[] = [];
  const closesAt = poll.closes_at ? new Date(poll.closes_at) : null;
  const closesValid = closesAt !== null && !Number.isNaN(closesAt.getTime());
  const closed = Boolean(poll.closed_at) || (closesValid && closesAt!.getTime() <= now.getTime());
  if (closed) out.push({ key: 'closed', label: 'Closed' });
  else if (closesValid) out.push({ key: 'closes', label: `Closes ${dateFmt.format(closesAt!)}` });
  if (poll.require_login) out.push({ key: 'login', label: 'Sign-in required' });
  return out;
}
