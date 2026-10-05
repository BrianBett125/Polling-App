import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkEnv } = require('../scripts/check-env.js');

const script = path.join(__dirname, '..', 'scripts', 'check-env.js');
const run = (env: Record<string, string>) =>
  spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' });

describe('checkEnv', () => {
  it('lists what is missing', () => {
    expect(checkEnv({})).toMatchObject({ missing: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'], onVercel: false });
    expect(checkEnv({ NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }).missing).toEqual([]);
  });
});

describe('scripts/check-env.js', () => {
  it('fails the build on Vercel with a readable message when public vars are missing', () => {
    const r = run({ VERCEL: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(r.stderr).toContain('Environment Variables');
  });

  it('only warns outside Vercel', () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('warning');
  });

  it('passes silently with everything set', () => {
    const r = run({ VERCEL: '1', NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's' });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });
});
