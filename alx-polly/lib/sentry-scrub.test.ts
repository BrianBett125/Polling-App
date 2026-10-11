import { describe, expect, it } from 'vitest';
import { parseSampleRate, scrubEvent, type ScrubbableEvent } from './sentry-scrub';

describe('parseSampleRate', () => {
  it('defaults to 0.1', () => {
    expect(parseSampleRate(undefined)).toBe(0.1);
    expect(parseSampleRate('')).toBe(0.1);
  });
  it('accepts 0..1 and rejects the rest', () => {
    expect(parseSampleRate('0')).toBe(0);
    expect(parseSampleRate('0.5')).toBe(0.5);
    expect(parseSampleRate('1')).toBe(1);
    for (const v of ['2', '-1', 'abc', 'NaN']) expect(parseSampleRate(v)).toBe(0.1);
  });
});

const make = (): ScrubbableEvent => ({
  message: 'boom',
  request: {
    url: 'https://x.test/auth/callback?code=SECRETCODE&next=/polls',
    cookies: { 'sb-access-token': 'abc', voter: 'v' },
    headers: {
      Cookie: 'sb=1',
      Authorization: 'Bearer abc',
      'X-Api-Key': 'k',
      'set-cookie': 's',
      'user-agent': 'UA',
      accept: 'text/html',
    },
    query_string: 'code=SECRETCODE&q=hi',
    data: { password: 'hunter2' },
  },
  user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
  breadcrumbs: [{ data: { url: '/x?token=T1&ok=1', headers: { a: 'b' } } }],
});

describe('scrubEvent', () => {
  it('removes cookies and request bodies', () => {
    const e = scrubEvent(make());
    expect(e.request?.cookies).toBeUndefined();
    expect(e.request?.data).toBeUndefined();
  });
  it('redacts sensitive headers case-insensitively and keeps harmless ones', () => {
    const h = scrubEvent(make()).request!.headers!;
    expect(h.Cookie).toBe('[redacted]');
    expect(h.Authorization).toBe('[redacted]');
    expect(h['X-Api-Key']).toBe('[redacted]');
    expect(h['set-cookie']).toBe('[redacted]');
    expect(h['user-agent']).toBe('UA');
    expect(h.accept).toBe('text/html');
  });
  it('redacts secret URL and query-string params', () => {
    const e = scrubEvent(make());
    expect(JSON.stringify(e)).not.toContain('SECRETCODE');
    expect(JSON.stringify(e)).not.toContain('T1');
    expect(e.request!.url).toContain('next=%2Fpolls');
    expect(e.request!.query_string).toContain('q=hi');
  });
  it('drops user PII but keeps the id', () => {
    const u = scrubEvent(make()).user!;
    expect(u).toEqual({ id: 'u1' });
  });
  it('drops breadcrumb headers', () => {
    expect(scrubEvent(make()).breadcrumbs![0].data!.headers).toBeUndefined();
  });
  it('tolerates events with nothing to scrub', () => {
    expect(scrubEvent({})).toEqual({});
    expect(scrubEvent({ request: {} })).toEqual({ request: {} });
  });
});
