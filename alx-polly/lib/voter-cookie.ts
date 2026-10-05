// Edge-safe half of the voter identity (used by middleware): Web Crypto only, no node:crypto.
//
// The cookie is `<secret>.<signature>`: a random 256-bit secret plus an HMAC-SHA256 of it
// under a server-side key. Only this server can produce a valid pair, so a client cannot
// invent an identity by sending a cookie of its own choosing. (A client can still discard
// cookies and fetch a fresh one: one vote per browser is a best-effort limit, not fraud protection.)

/** Name of the httpOnly cookie that identifies a browser as a voter. */
// In production the __Host- prefix makes browsers accept the cookie only if it is Secure, has
// Path=/ and no Domain, so a sibling subdomain cannot plant (fixate) a cookie of its own.
// Plain http on localhost cannot satisfy that, so development uses the bare name.
export const VOTER_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-poll_voter' : 'poll_voter';
export const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const SECRET_RE = /^[0-9a-f]{64}$/;
const COOKIE_RE = /^[0-9a-f]{64}\.[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes as ArrayBuffer), (b) => b.toString(16).padStart(2, '0')).join('');

/** A fresh random browser secret (256 bits, hex). Generated only on the server. */
export function newVoterSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes);
}

export function isVoterSecret(value: unknown): value is string {
  return typeof value === 'string' && SECRET_RE.test(value);
}

/** Server-side signing key: VOTER_COOKIE_SECRET, else the service role key. Null when neither is set. */
function signingKey(): string | null {
  return process.env.VOTER_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

async function hmacHex(message: string, key: string): Promise<string> {
  const k = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await globalThis.crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cookie value for a secret, or null when no signing key is configured. */
export async function signVoterCookie(secret: string): Promise<string | null> {
  const key = signingKey();
  if (!key || !isVoterSecret(secret)) return null;
  return `${secret}.${await hmacHex(secret, key)}`;
}

/** The secret inside a cookie this server issued, or null for anything missing, malformed or forged. */
export async function verifyVoterCookie(value: unknown): Promise<string | null> {
  const key = signingKey();
  if (!key || typeof value !== 'string' || !COOKIE_RE.test(value)) return null;
  const [secret, sig] = value.split('.');
  return constantTimeEqual(sig, await hmacHex(secret, key)) ? secret : null;
}

/**
 * Middleware rule: which cookie value, if any, to set for this request.
 * Only a poll page load (/polls/<uuid>) from a browser without a valid cookie gets one;
 * everything else, including an existing valid cookie, is left alone.
 */
export async function voterCookieToIssue(pathname: string, existingCookie: string | undefined): Promise<string | null> {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const m = /^\/polls\/([^/]+)\/?$/.exec(path.replace(/\/{2,}/g, '/'));
  if (!m || !UUID_RE.test(m[1])) return null;
  if (await verifyVoterCookie(existingCookie)) return null;
  return signVoterCookie(newVoterSecret());
}

export const voterCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: VOTER_COOKIE_MAX_AGE,
});
