import { describe, expect, it, vi } from 'vitest';
import { clientIpFrom, LIMITS_BY_ACTION, rateLimitKey, withinRateLimit } from './rate-limit';

const hdr = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });
const fakeAdmin = (result: { data?: unknown; error?: { code: string } | null }) =>
  ({ rpc: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })) }) as never;

describe('clientIpFrom', () => {
  it('uses the first x-forwarded-for entry, then x-real-ip, then unknown', () => {
    expect(clientIpFrom(hdr({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientIpFrom(hdr({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(clientIpFrom(hdr({}))).toBe('unknown');
  });
});

describe('rateLimitKey', () => {
  it('is stable, prefixed by action, and never contains the identity', () => {
    const k = rateLimitKey('vote', '203.0.113.7');
    expect(k).toBe(rateLimitKey('vote', '203.0.113.7'));
    expect(k.startsWith('vote:')).toBe(true);
    expect(k).not.toContain('203.0.113.7');
    expect(rateLimitKey('vote', '203.0.113.8')).not.toBe(k);
    expect(rateLimitKey('createPoll', '203.0.113.7')).not.toBe(k);
  });
});

describe('withinRateLimit', () => {
  it('passes the action budget to the database and returns its verdict', async () => {
    const admin = fakeAdmin({ data: false });
    expect(await withinRateLimit('vote', '1.1.1.1', { admin })).toBe(false);
    const [limit, secs] = LIMITS_BY_ACTION.vote;
    expect((admin as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: rateLimitKey('vote', '1.1.1.1'),
      p_limit: limit,
      p_window_seconds: secs,
    });
    expect(await withinRateLimit('vote', '1.1.1.1', { admin: fakeAdmin({ data: true }) })).toBe(true);
  });

  it('does not put every unidentifiable client in one shared bucket', async () => {
    const admin = fakeAdmin({ data: false });
    expect(await withinRateLimit('vote', 'unknown', { admin })).toBe(true);
    expect((admin as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it('fails open when the service role is not configured or the call errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await withinRateLimit('vote', 'x', { admin: null })).toBe(true);
    expect(await withinRateLimit('vote', 'x', { admin: fakeAdmin({ error: { code: '500' } }) })).toBe(true);
    spy.mockRestore();
  });
});
