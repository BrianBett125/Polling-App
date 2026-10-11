import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { getAdminSupabase } from './supabase-server';

/** Per-action budgets: [max hits, window seconds]. Tuned to stop scripts, not people. */
export const LIMITS_BY_ACTION = {
  vote: [30, 600], // per client, per 10 minutes, across polls
  createPoll: [10, 3600], // per account, per hour
  deleteAccount: [3, 3600],
} as const satisfies Record<string, readonly [number, number]>;
export type RateLimitedAction = keyof typeof LIMITS_BY_ACTION;

/** Best-effort client address. On Vercel x-forwarded-for is set by the platform, not the client. */
export function clientIpFrom(h: { get(name: string): string | null }): string {
  const fwd = h.get('x-forwarded-for');
  const first = fwd?.split(',')[0]?.trim();
  return first || h.get('x-real-ip')?.trim() || 'unknown';
}

/** Hash before storing: the table never holds an address or an account id in clear. */
export function rateLimitKey(action: string, identity: string): string {
  return `${action}:${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

/**
 * Counts one hit and returns false when `identity` is over budget for `action`.
 * Fails open if the database cannot be reached (an outage must not block every vote),
 * and says so in the log. `identity` is an IP for anonymous actions, a user id otherwise.
 */
export async function withinRateLimit(
  action: RateLimitedAction,
  identity: string,
  deps: { admin?: ReturnType<typeof getAdminSupabase> } = {},
): Promise<boolean> {
  // No usable client address (no forwarding header): one shared bucket would let a single caller
  // lock every visitor out, so this layer steps aside. The captcha and the database still apply.
  if (identity === 'unknown') return true;
  const admin = deps.admin === undefined ? getAdminSupabase() : deps.admin;
  if (!admin) return true;
  const [limit, windowSeconds] = LIMITS_BY_ACTION[action];
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: rateLimitKey(action, identity),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('Rate limit check failed (allowing):', { code: error.code });
    return true;
  }
  return data === true;
}

/** Convenience for server actions: the caller's IP from the current request. */
export async function currentClientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

export const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.';
