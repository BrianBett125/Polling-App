import { describe, expect, it } from 'vitest';
import { LOCAL_SITE_URL, pollDescription, resolveSiteUrl, truncate } from './seo';

describe('truncate', () => {
  it('returns short text unchanged and collapses whitespace', () => {
    expect(truncate('  hello \n  world ', 160)).toBe('hello world');
  });
  it('never exceeds max and ends with an ellipsis when cut', () => {
    const out = truncate('x'.repeat(500), 160);
    expect(Array.from(out).length).toBe(160);
    expect(out.endsWith('…')).toBe(true);
  });
  it('allows exactly max characters without cutting', () => {
    const s = 'y'.repeat(160);
    expect(truncate(s, 160)).toBe(s);
  });
  it('prefers a word boundary', () => {
    const out = truncate('alpha beta gamma delta epsilon zeta', 20);
    expect(out).toBe('alpha beta gamma…');
    expect(Array.from(out).length).toBeLessThanOrEqual(20);
  });
  it('does not split surrogate pairs', () => {
    const out = truncate('😀'.repeat(300), 160);
    expect(Array.from(out).length).toBe(160);
    expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
  it('handles tiny budgets', () => {
    expect(truncate('abcdef', 1)).toBe('…');
    expect(truncate('', 10)).toBe('');
  });
});

describe('pollDescription', () => {
  it('falls back for null, undefined, empty and whitespace', () => {
    for (const v of [null, undefined, '', '   \n']) expect(pollDescription(v)).toBe('Vote on this poll');
  });
  it('truncates long descriptions to 160', () => {
    expect(Array.from(pollDescription('word '.repeat(100))).length).toBeLessThanOrEqual(160);
  });
});

describe('resolveSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL and returns the bare origin', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://polls.example.com/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe(
      'https://polls.example.com',
    );
  });
  it('adds https to a scheme-less site url', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'polls.example.com' })).toBe('https://polls.example.com');
  });
  it('uses the Vercel production host with https', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'alx-polly.vercel.app' })).toBe('https://alx-polly.vercel.app');
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'http://alx-polly.vercel.app' })).toBe('https://alx-polly.vercel.app');
  });
  it('falls back to localhost when nothing usable is set', () => {
    expect(resolveSiteUrl({})).toBe(LOCAL_SITE_URL);
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '  ' })).toBe(LOCAL_SITE_URL);
  });
  it('skips garbage and non-http schemes without throwing', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'ftp://x', VERCEL_PROJECT_PRODUCTION_URL: 'ok.vercel.app' })).toBe(
      'https://ok.vercel.app',
    );
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://' })).toBe(LOCAL_SITE_URL);
  });
});
