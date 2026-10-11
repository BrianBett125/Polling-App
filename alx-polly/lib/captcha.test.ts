import { describe, expect, it, vi } from 'vitest';
import { isCaptchaConfigured, verifyCaptcha } from './captcha';

const ok = (success: boolean) => vi.fn(async () => new Response(JSON.stringify({ success }), { status: 200 }));

describe('isCaptchaConfigured', () => {
  it('needs both keys', () => {
    expect(isCaptchaConfigured({})).toBe(false);
    expect(isCaptchaConfigured({ TURNSTILE_SECRET_KEY: 's' })).toBe(false);
    expect(isCaptchaConfigured({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })).toBe(false);
    expect(isCaptchaConfigured({ TURNSTILE_SECRET_KEY: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })).toBe(true);
  });
});

describe('verifyCaptcha', () => {
  it('passes everyone when no secret is configured (feature off) and never calls out', async () => {
    const f = ok(false);
    expect(await verifyCaptcha(undefined, null, { env: {}, fetchImpl: f as never })).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it('accepts a token Cloudflare approves, sending secret, token and ip', async () => {
    const f = ok(true);
    expect(await verifyCaptcha('tok', '1.2.3.4', { env: { TURNSTILE_SECRET_KEY: 's' }, fetchImpl: f as never })).toBe(true);
    const body = (f.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(Object.fromEntries(body)).toEqual({ secret: 's', response: 'tok', remoteip: '1.2.3.4' });
  });

  it('rejects a token Cloudflare refuses', async () => {
    expect(await verifyCaptcha('tok', null, { env: { TURNSTILE_SECRET_KEY: 's' }, fetchImpl: ok(false) as never })).toBe(false);
  });

  it('rejects a missing, empty or oversized token without calling out', async () => {
    const f = ok(true);
    const env = { TURNSTILE_SECRET_KEY: 's' };
    for (const t of [undefined, null, '', 'x'.repeat(5000)]) {
      expect(await verifyCaptcha(t, null, { env, fetchImpl: f as never })).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('fails closed when the verifier errors, times out or answers garbage', async () => {
    const env = { TURNSTILE_SECRET_KEY: 's' };
    expect(await verifyCaptcha('t', null, { env, fetchImpl: vi.fn(async () => { throw new Error('net'); }) as never })).toBe(false);
    expect(await verifyCaptcha('t', null, { env, fetchImpl: vi.fn(async () => new Response('no', { status: 500 })) as never })).toBe(false);
    expect(await verifyCaptcha('t', null, { env, fetchImpl: vi.fn(async () => new Response('not json', { status: 200 })) as never })).toBe(false);
  });
});
