import { describe, expect, it } from 'vitest';
import { formatLocal, formatUtc } from './time-format';

const WHEN = new Date('2026-03-05T10:30:00Z');

describe('formatUtc', () => {
  it('prints the UTC wall time and says UTC', () => {
    const t = formatUtc(WHEN);
    expect(t).toContain('10:30');
    expect(t.endsWith(' UTC')).toBe(true);
    expect(t).toContain('2026');
  });
});

describe('formatLocal', () => {
  // Regression: this combination used to be dateStyle + timeStyle + timeZoneName, which throws
  // "TypeError: Invalid option" and broke every poll page that has a closing time.
  it('does not throw and carries a time zone name', () => {
    expect(() => formatLocal(WHEN)).not.toThrow();
    expect(formatLocal(WHEN, 'en-US', 'America/New_York')).toMatch(/5:30\s?AM\s+(EST|GMT-5)/);
    expect(formatLocal(WHEN, 'en-GB', 'Asia/Tokyo')).toMatch(/19:30\s+(GMT\+9|JST)/);
  });

  it('differs from UTC text for a non-UTC zone and names it', () => {
    expect(formatLocal(WHEN, 'en-US', 'Pacific/Auckland')).toMatch(/NZDT|GMT\+13/);
  });

  it('works with the default locale and zone', () => {
    expect(formatLocal(WHEN).length).toBeGreaterThan(8);
  });
});
