import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('vercel.json', () => {
  it('targets Next.js and uses scripts that exist in package.json', () => {
    expect(vercel.framework).toBe('nextjs');
    expect(vercel.installCommand).toBe('npm ci');
    expect(vercel.buildCommand).toBe('npm run build');
    expect(pkg.scripts.build).toContain('check-env.js');
  });

  it('sets baseline security headers on every route (next.config.ts, so they apply off Vercel too)', async () => {
    const { default: config } = await import('../next.config');
    const rules = await config.headers!();
    const rule = rules.find((h) => h.source === '/(.*)')!;
    const keys = rule.headers.map((h) => h.key);
    expect(keys).toEqual(expect.arrayContaining(['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']));
  });

  it('never carries secrets', () => {
    expect(JSON.stringify(vercel)).not.toMatch(/service_role|SUPABASE_SERVICE|eyJ/);
  });
});
