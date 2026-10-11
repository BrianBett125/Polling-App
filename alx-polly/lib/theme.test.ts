import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parseThemeChoice, resolveTheme, THEME_INIT_SCRIPT } from './theme';

describe('parseThemeChoice / resolveTheme', () => {
  it('only accepts light and dark, everything else is system', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    for (const v of ['system', '', null, undefined, 'DARK', 3]) expect(parseThemeChoice(v)).toBe('system');
  });
  it('explicit choices ignore the OS, system follows it', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

type Env = { stored?: string | null; storageThrows?: boolean; matchMediaThrows?: boolean; osDark?: boolean };

/** Executes the real inline script against a fake window/document and returns the resulting <html> state. */
function run(env: Env) {
  const classes = new Set<string>(['pre-existing']);
  const root = {
    classList: {
      add: (...c: string[]) => c.forEach((x) => classes.add(x)),
      remove: (...c: string[]) => c.forEach((x) => classes.delete(x)),
    },
    style: { colorScheme: '' },
  };
  const ctx = {
    document: { documentElement: root },
    window: {
      matchMedia: (q: string) => {
        if (env.matchMediaThrows) throw new Error('no matchMedia');
        return { matches: q.includes('dark') && Boolean(env.osDark) };
      },
    },
    localStorage: {
      getItem: (k: string) => {
        if (env.storageThrows) throw new Error('blocked');
        return k === 'theme' ? (env.stored ?? null) : null;
      },
    },
  };
  vm.runInNewContext(THEME_INIT_SCRIPT, ctx);
  return { classes, colorScheme: root.style.colorScheme };
}

describe('THEME_INIT_SCRIPT', () => {
  it('applies a stored dark choice even when the OS is light', () => {
    const r = run({ stored: 'dark', osDark: false });
    expect(r.classes.has('dark')).toBe(true);
    expect(r.classes.has('light')).toBe(false);
    expect(r.colorScheme).toBe('dark');
  });
  it('applies a stored light choice even when the OS is dark', () => {
    const r = run({ stored: 'light', osDark: true });
    expect(r.classes.has('light')).toBe(true);
    expect(r.classes.has('dark')).toBe(false);
  });
  it('follows the OS for system and for missing or junk values', () => {
    expect(run({ stored: 'system', osDark: true }).classes.has('dark')).toBe(true);
    expect(run({ stored: null, osDark: false }).classes.has('light')).toBe(true);
    expect(run({ stored: 'purple', osDark: true }).classes.has('dark')).toBe(true);
  });
  it('still follows the OS when localStorage throws', () => {
    expect(run({ storageThrows: true, osDark: true }).classes.has('dark')).toBe(true);
  });
  it('falls back to light when matchMedia throws, and never throws itself', () => {
    expect(run({ matchMediaThrows: true, stored: null }).classes.has('light')).toBe(true);
    expect(run({ matchMediaThrows: true, storageThrows: true }).classes.has('light')).toBe(true);
  });
  it('keeps unrelated classes and leaves exactly one theme class', () => {
    const r = run({ stored: 'dark' });
    expect(r.classes.has('pre-existing')).toBe(true);
    expect([...r.classes].filter((c) => c === 'dark' || c === 'light')).toHaveLength(1);
  });
  it('hashes to the value documented in docs/ACCESSIBILITY.md (update both if the script changes)', () => {
    const hash = createHash('sha256').update(THEME_INIT_SCRIPT).digest('base64');
    const docs = readFileSync(path.resolve(__dirname, '../docs/ACCESSIBILITY.md'), 'utf8');
    expect(docs).toContain(`sha256-${hash}`);
  });
});
