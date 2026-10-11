import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Reads the real design tokens from app/globals.css and checks the contrast of the pairs the UI relies on.
// axe-core in a browser is the full audit (docs/ACCESSIBILITY.md); this is the cheap guard that runs on every commit.

const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

function block(selector: RegExp): string {
  const m = css.match(selector);
  if (!m) throw new Error(`block not found: ${selector}`);
  // from the opening brace to its matching close
  let depth = 0;
  let i = m.index! + m[0].length - 1;
  const start = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(start + 1, i);
}

function vars(body: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function toRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = vars(block(/:root\s*\{/));
const dark = vars(block(/\n\.dark\s*\{/));

// [foreground token, background token, minimum ratio]. 4.5 for text, 3 for non-text indicators.
const PAIRS: [string, string, number][] = [
  ['foreground', 'background', 4.5],
  ['card-foreground', 'card', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'card', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['success', 'success-soft', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['primary', 'background', 4.5], // links and "primary" text on the page
  ['ring', 'background', 3],
  ['input', 'background', 1.2], // field borders must at least be visible against the page
];

describe('design tokens parse', () => {
  it('finds the light and dark token sets', () => {
    for (const t of ['background', 'foreground', 'primary', 'card', 'muted-foreground', 'success', 'warning']) {
      expect(light[t], `light --${t}`).toBeDefined();
      expect(dark[t], `dark --${t}`).toBeDefined();
    }
  });

  it('keeps the system-dark fallback block identical to .dark', () => {
    const fallback = vars(block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\.light\):not\(\.dark\)\s*\{/));
    expect(fallback).toEqual(dark);
  });
});

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme contrast', (_name, tokens) => {
  it.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
    const ratio = contrast(toRgb(tokens[fg]), toRgb(tokens[bg]));
    expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
  });
});

describe('brand gradient', () => {
  it.each(['brand-1', 'brand-2', 'brand-3'])('white text on --%s is at least 4.5:1', (stop) => {
    const ratio = contrast([255, 255, 255], toRgb(light[stop]));
    expect(ratio, `white on ${stop} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast helper', () => {
  it('matches known WCAG values', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrast([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 1);
  });
});
