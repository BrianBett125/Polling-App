import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS_STATIC, buildCsp } from './csp';

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(`${name} `) || d === name);

const prod = { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co/' };
const dev = { NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };

describe('buildCsp', () => {
  it('sets every required directive', () => {
    const csp = buildCsp(prod);
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob:");
    expect(directive(csp, 'font-src')).toBe("font-src 'self' data:");
    expect(directive(csp, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com');
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'form-action')).toBe("form-action 'self'");
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'");
  });

  it('allows Turnstile and Vercel analytics scripts, and only those hosts', () => {
    const script = directive(buildCsp(prod), 'script-src')!;
    expect(script).toContain("'self' 'unsafe-inline'");
    expect(script).toContain('https://challenges.cloudflare.com');
    expect(script).toContain('https://va.vercel-scripts.com');
  });

  it('connect-src lists the configured Supabase origin (normalised) and the telemetry hosts', () => {
    const connect = directive(buildCsp(prod), 'connect-src')!;
    for (const h of [
      "'self'",
      'https://abcd.supabase.co',
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://*.ingest.sentry.io',
      'https://*.ingest.us.sentry.io',
      'https://vitals.vercel-insights.com',
      'https://va.vercel-scripts.com',
    ]) {
      expect(connect.split(' ')).toContain(h);
    }
    expect(connect).not.toContain('abcd.supabase.co/');
  });

  it('adds unsafe-eval and websockets in development only', () => {
    expect(directive(buildCsp(dev), 'script-src')).toContain("'unsafe-eval'");
    expect(directive(buildCsp(dev), 'connect-src')).toContain('http://127.0.0.1:54321');
    expect(buildCsp(prod)).not.toContain('unsafe-eval');
    expect(buildCsp({ NODE_ENV: 'test' })).not.toContain('unsafe-eval');
    expect(buildCsp(prod)).not.toContain('ws://localhost');
  });

  it('upgrades insecure requests in production only', () => {
    expect(buildCsp(prod).split('; ')).toContain('upgrade-insecure-requests');
    expect(buildCsp(dev)).not.toContain('upgrade-insecure-requests');
  });

  it('never allows a bare wildcard, data: or blob: scripts, or http: sources in script-src', () => {
    for (const env of [prod, dev]) {
      const script = directive(buildCsp(env), 'script-src')!.split(' ');
      expect(script).not.toContain('*');
      expect(script).not.toContain('data:');
      expect(script).not.toContain('blob:');
      expect(script).not.toContain('https:');
      expect(script.some((s) => s.startsWith('http:'))).toBe(false);
    }
    expect(buildCsp(prod).split(/[\s;]+/)).not.toContain('*');
  });

  it('ignores a malformed or non-http Supabase URL instead of throwing', () => {
    for (const url of ['not a url', 'javascript:alert(1)', '', undefined]) {
      const csp = buildCsp({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: url });
      expect(csp).not.toContain('javascript');
      expect(directive(csp, 'connect-src')).toContain('https://*.supabase.co');
    }
  });

  it('contains no newline that could split the header', () => {
    expect(buildCsp(prod)).not.toMatch(/[\r\n]/);
  });
});

describe('static security headers', () => {
  it('includes HSTS and Permissions-Policy', () => {
    const map = Object.fromEntries(SECURITY_HEADERS_STATIC.map((h) => [h.key, h.value]));
    expect(map['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(map['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(map['X-Content-Type-Options']).toBe('nosniff');
  });
});
