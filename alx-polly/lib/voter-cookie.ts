// Edge-safe half of the voter identity (used by middleware): no node:crypto here.

/** Name of the httpOnly cookie that identifies a browser as a voter. */
export const VOTER_COOKIE = 'poll_voter';
export const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const SECRET_RE = /^[0-9a-f]{64}$/;

/** A fresh random browser secret (256 bits, hex). Generated only on the server. */
export function newVoterSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isVoterSecret(value: unknown): value is string {
  return typeof value === 'string' && SECRET_RE.test(value);
}

export const voterCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: VOTER_COOKIE_MAX_AGE,
});
