import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = { getSession: vi.fn(), getUser: vi.fn() };
// Like the real client, a getUser() call may refresh the session and write a cookie onto `res`.
let refreshSession = false;
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: vi.fn(({ res }: { res: any }) => ({
    auth: {
      getSession: auth.getSession,
      getUser: async () => {
        if (refreshSession) res.cookies.set('sb-access-token', 'refreshed');
        return auth.getUser();
      },
    },
  })),
}));

import { middleware } from '../middleware';
import { signVoterCookie, newVoterSecret } from './voter-cookie';

const ID = '11111111-1111-4111-8111-111111111111';
const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  refreshSession = false;
  process.env.VOTER_COOKIE_SECRET = 'unit-test-signing-key';
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.getUser.mockResolvedValue({ data: { user: null } });
});

describe('middleware', () => {
  it('sets a signed httpOnly voter cookie on a first poll page load', async () => {
    const res = await middleware(req(`/polls/${ID}`));
    const c = res.cookies.get('poll_voter');
    expect(c?.value).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=lax/i);
  });

  it('does not touch an existing valid cookie', async () => {
    const good = (await signVoterCookie(newVoterSecret()))!;
    const res = await middleware(req(`/polls/${ID}`, `poll_voter=${good}`));
    expect(res.cookies.get('poll_voter')).toBeUndefined();
  });

  it('replaces a forged cookie', async () => {
    const forged = `${newVoterSecret()}.${'0'.repeat(64)}`;
    const res = await middleware(req(`/polls/${ID}`, `poll_voter=${forged}`));
    expect(res.cookies.get('poll_voter')?.value).not.toBe(forged);
  });

  it('does not issue cookies on other routes', async () => {
    for (const p of ['/auth', '/polls/not-a-uuid']) {
      const res = await middleware(req(p));
      expect(res.cookies.get('poll_voter')).toBeUndefined();
    }
  });

  it('redirects signed-out visitors from protected routes to /auth with a safe next', async () => {
    for (const p of ['/polls', '/polls/new', `/polls/${ID}/edit`, '/polls//new', '/POLLS/New', '/polls/%6Eew']) {
      const res = await middleware(req(p));
      expect(res.status, p).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname, p).toBe('/auth');
      expect(res.headers.get('location'), p).toContain('next=');
    }
  });

  it('lets a signed-in user through and bounces them away from /auth', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    expect((await middleware(req('/polls/new'))).status).toBe(200);
    const res = await middleware(req('/auth?next=%2Fpolls%2Fnew'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/polls/new');
    const evil = await middleware(req('/auth?next=%2F%2Fevil.example'));
    expect(new URL(evil.headers.get('location')!).host).toBe('localhost:3000');
  });

  it('keeps a refreshed auth cookie on both redirects', async () => {
    refreshSession = true;
    const toAuth = await middleware(req('/polls/new'));
    expect(toAuth.status).toBe(307);
    expect(toAuth.cookies.get('sb-access-token')?.value).toBe('refreshed');

    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const fromAuth = await middleware(req('/auth'));
    expect(fromAuth.status).toBe(307);
    expect(fromAuth.cookies.get('sb-access-token')?.value).toBe('refreshed');
  });

  it('marks a cookie-issuing response private and uncacheable', async () => {
    const res = await middleware(req(`/polls/${ID}`));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const other = await middleware(req('/auth'));
    expect(other.headers.get('cache-control')).toBeNull();
  });

  it('never asks Supabase Auth to validate on public poll pages', async () => {
    await middleware(req(`/polls/${ID}`));
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});
