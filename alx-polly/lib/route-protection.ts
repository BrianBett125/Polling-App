/**
 * Which paths need a signed-in user. Poll pages (/polls/<id>) and /auth stay public:
 * anyone with a poll link can view and vote.
 */
export function isProtectedPath(pathname: string): boolean {
  // Normalise before matching so //, trailing slashes, case and %-encoding cannot dodge the guard.
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true; // undecodable path: fail closed
  }
  const collapsed = decoded.toLowerCase().replace(/\/{2,}/g, '/');
  const p = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  if (p === '/polls' || p === '/polls/new') return true;
  return /^\/polls\/[^/]+\/edit$/.test(p);
}

/** Post-login destination from ?next=. Only same-site absolute paths are honoured. */
export function safeNextPath(next: string | null | undefined, fallback = '/polls'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
