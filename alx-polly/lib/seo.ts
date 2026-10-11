/** Pure helpers for page metadata. No framework imports so they are unit-testable. */

export const SITE_NAME = 'ALX Polly';
export const DEFAULT_POLL_DESCRIPTION = 'Vote on this poll';
export const DESCRIPTION_MAX = 160;
export const LOCAL_SITE_URL = 'http://localhost:3000';

/**
 * Collapses whitespace and cuts `text` to at most `max` characters, ending in an ellipsis when it
 * was shortened. Cuts on a word boundary when one exists in the last 40% of the budget.
 * Counts code points, so an emoji is never split in half.
 */
export function truncate(text: string, max = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  if (max <= 1) return '…'.slice(0, max);
  const budget = max - 1; // room for the ellipsis
  let cut = chars.slice(0, budget).join('');
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace >= budget * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
}

/** Description for a poll: its own text truncated to 160 characters, else the generic line. */
export function pollDescription(description: string | null | undefined): string {
  const t = (description ?? '').trim();
  return t ? truncate(t, DESCRIPTION_MAX) : DEFAULT_POLL_DESCRIPTION;
}

type SiteEnv = Record<string, string | undefined>;

/**
 * Absolute origin used for `metadataBase`. Order: NEXT_PUBLIC_SITE_URL, then Vercel's
 * VERCEL_PROJECT_PRODUCTION_URL (a bare host, so https is prepended), then localhost.
 * Anything that does not parse as an http(s) URL is skipped rather than throwing,
 * because a bad env var must not take the whole app down at render time.
 */
export function resolveSiteUrl(env: SiteEnv = process.env): string {
  const candidates = [
    env.NEXT_PUBLIC_SITE_URL?.trim(),
    // Preview deployments have no production URL variable, but VERCEL_URL is always set on Vercel.
    env.VERCEL_ENV && env.VERCEL_ENV !== 'production' && env.VERCEL_URL?.trim()
      ? `https://${env.VERCEL_URL.trim().replace(/^https?:\/\//, '')}`
      : undefined,
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL!.trim().replace(/^https?:\/\//, '')}`
      : undefined,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(c) ? c : `https://${c}`;
    try {
      const u = new URL(withScheme);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
    } catch {
      // try the next candidate
    }
  }
  return LOCAL_SITE_URL;
}
