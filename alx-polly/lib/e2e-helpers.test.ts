import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const h = require('../scripts/e2e/helpers.js');

const run = path.join(__dirname, '..', 'scripts', 'e2e', 'run.js');
const goodEnv = { SITE_URL: 'https://app.example.com/', SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-value' };

describe('readConfig', () => {
  it('normalises URLs and returns the key', () => {
    const { config, problems } = h.readConfig({ ...goodEnv, CHROME_PATH: ' /opt/chrome ' });
    expect(problems).toEqual([]);
    expect(config).toMatchObject({ siteUrl: 'https://app.example.com', siteIsHttps: true, supabaseUrl: 'https://abc.supabase.co', chromePath: '/opt/chrome' });
  });
  it('accepts NEXT_PUBLIC_SUPABASE_URL as a fallback and http for local runs', () => {
    const { config } = h.readConfig({ SITE_URL: 'http://localhost:3000', NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(10) });
    expect(config).toMatchObject({ siteUrl: 'http://localhost:3000', siteIsHttps: false });
  });
  it('lists every missing variable and never echoes the key', () => {
    const r = h.readConfig({});
    expect(r.config).toBeNull();
    expect(r.problems).toHaveLength(3);
    const bad = h.readConfig({ SITE_URL: 'ftp://x', SUPABASE_URL: 'nope', SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-value' });
    expect(bad.config).toBeNull();
    expect(bad.problems.join(' ')).not.toContain('service-role-secret-value');
    expect(bad.problems).toHaveLength(2);
  });
});

describe('findChrome', () => {
  it('prefers CHROME_PATH and reports a missing file', () => {
    expect(h.findChrome({ CHROME_PATH: '/a' }, () => true)).toEqual({ path: '/a', source: 'CHROME_PATH' });
    expect(h.findChrome({ CHROME_PATH: '/a' }, () => false).path).toBeNull();
  });
  it('auto-detects per platform and reports none', () => {
    expect(h.findChrome({}, (p: string) => p === '/usr/bin/chromium', 'linux').path).toBe('/usr/bin/chromium');
    expect(h.findChrome({}, () => false, 'linux').path).toBeNull();
    expect(h.findChrome({}, () => false, 'plan9').path).toBeNull();
  });
});

describe('makeThrowaway', () => {
  it('is unique, uses the reserved example.com domain and a strong password', () => {
    const a = h.makeThrowaway();
    const b = h.makeThrowaway();
    expect(a.email).toMatch(/^e2e-throwaway-[a-z0-9-]+@example\.com$/);
    expect(a.email).not.toBe(b.email);
    expect(a.password).toMatch(/^Aa1!/);
    expect(a.password.length).toBeGreaterThanOrEqual(24);
    expect(a.editedTitle).toContain(a.pollTitle);
  });
  it('is deterministic given its inputs', () => {
    expect(h.makeThrowaway(36, () => 'abc').tag).toBe('10-abc');
  });
});

describe('assertVoterCookie', () => {
  const ok = { name: '__Host-poll_voter', httpOnly: true, secure: true, path: '/' };
  it('accepts the production cookie on https', () => {
    expect(h.assertVoterCookie([ok], true)).toBe('__Host-poll_voter');
  });
  it('rejects missing, non-HttpOnly, non-Secure, wrong path and unprefixed cookies on https', () => {
    expect(() => h.assertVoterCookie([], true)).toThrow(/missing/);
    expect(() => h.assertVoterCookie([{ ...ok, httpOnly: false }], true)).toThrow(/HttpOnly/);
    expect(() => h.assertVoterCookie([{ ...ok, secure: false }], true)).toThrow(/Secure/);
    expect(() => h.assertVoterCookie([{ ...ok, path: '/polls' }], true)).toThrow(/path/);
    expect(() => h.assertVoterCookie([{ ...ok, name: 'poll_voter' }], true)).toThrow(/missing/);
  });
  it('allows the unprefixed cookie on plain http only', () => {
    const dev = { name: 'poll_voter', httpOnly: true, secure: false, path: '/' };
    expect(h.assertVoterCookie([dev], false)).toBe('poll_voter');
    expect(() => h.assertVoterCookie([{ ...dev, httpOnly: false }], false)).toThrow(/HttpOnly/);
  });
});

describe('pollIdFromUrl / pollUrl', () => {
  const id = '6a0fd759-a87b-4fb4-a577-74aced1fb397';
  it('extracts the id, ignoring query and trailing slash, and rejects other paths', () => {
    expect(h.pollIdFromUrl(`https://x.test/polls/${id}`)).toBe(id);
    expect(h.pollIdFromUrl(`https://x.test/polls/${id}/?created=1`)).toBe(id);
    expect(h.pollIdFromUrl(`https://x.test/polls/${id}/edit`)).toBeNull();
    expect(h.pollIdFromUrl('https://x.test/polls/new')).toBeNull();
    expect(h.pollIdFromUrl('not a url')).toBeNull();
  });
  it('builds the share URL', () => {
    expect(h.pollUrl('https://x.test/', id)).toBe(`https://x.test/polls/${id}`);
  });
});

describe('redact', () => {
  it('removes secrets everywhere and ignores empty or tiny ones', () => {
    expect(h.redact('key=abcdef123 and abcdef123', ['abcdef123', '', 'a'])).toBe('key=[redacted] and [redacted]');
  });
});

describe('run.js --dry', () => {
  const exec = (env: Record<string, string>, args: string[] = ['--dry']) =>
    spawnSync(process.execPath, [run, ...args], { env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' });

  it('exits 2 and names the missing variables', () => {
    const r = exec({});
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/SITE_URL is not set/);
  });
  it('prints the plan, makes no network call and never prints the key', () => {
    const r = exec({ ...goodEnv, CHROME_PATH: process.execPath });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Steps that would run/);
    expect(r.stdout).toMatch(/Dry run: no network calls/);
    expect(r.stdout + r.stderr).not.toContain('service-role-secret-value');
  });
  it('exits 2 when the browser cannot be found', () => {
    expect(exec({ ...goodEnv, CHROME_PATH: '/nonexistent/chrome' }).status).toBe(2);
  });
  it('rejects unknown arguments', () => {
    expect(exec({ ...goodEnv }, ['--bogus']).status).toBe(2);
  });
});
