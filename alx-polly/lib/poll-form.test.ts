import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  cleanOptions,
  isoToLocalInput,
  localInputToIso,
  parsePollEdit,
  parsePollForm,
  parsePollSettings,
  validateOptions,
} from './poll-form';

describe('localInputToIso / isoToLocalInput', () => {
  it('reads the value in the runtime timezone and returns UTC', () => {
    expect(localInputToIso('2030-01-02T10:30')).toBe(new Date(2030, 0, 2, 10, 30).toISOString());
  });
  it('round-trips through the local input format', () => {
    expect(isoToLocalInput(localInputToIso('2031-07-04T23:05'))).toBe('2031-07-04T23:05');
  });
  it('returns empty for blank, malformed or impossible values', () => {
    expect(localInputToIso('')).toBe('');
    expect(localInputToIso('2030-01-02')).toBe('');
    expect(localInputToIso('2030-02-31T10:00')).toBe('');
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('nope')).toBe('');
  });
});

describe('validateOptions / cleanOptions', () => {
  it('cleans and validates', () => {
    expect(cleanOptions([' a ', '', 3, null, 'b'])).toEqual(['a', 'b']);
    expect(validateOptions(['a', 'b'])).toBeNull();
    expect(validateOptions(['a'])).toBe('At least two options are required');
    expect(validateOptions(['A', 'a'])).toBe('Options must be different from each other');
  });
});

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('parsePollForm', () => {
  it('trims, drops blank options and orders by index', () => {
    const r = parsePollForm(fd({ title: '  My Poll ', description: ' d ', 'option-10': 'C', 'option-2': ' B ', 'option-1': ' A ', 'option-3': '  ' }));
    expect(r).toEqual({ ok: true, value: { title: 'My Poll', description: 'd', options: ['A', 'B', 'C'], closesAt: null, requireLogin: false, resultsVisibility: 'always' } });
  });

  it('ignores unrelated form fields', () => {
    const r = parsePollForm(fd({ title: 't', 'option-0': 'a', 'option-1': 'b', 'option-x': 'zzz', $ACTION_ID: 'q' }));
    expect(r).toMatchObject({ ok: true, value: { options: ['a', 'b'] } });
  });

  it.each([
    ['blank title', { title: '   ', 'option-0': 'a', 'option-1': 'b' }, 'Title is required'],
    ['one option', { title: 't', 'option-0': 'a' }, 'At least two options are required'],
    ['one real option', { title: 't', 'option-0': 'a', 'option-1': ' ' }, 'At least two options are required'],
    ['duplicate options', { title: 't', 'option-0': 'Yes', 'option-1': ' yes ' }, 'Options must be different from each other'],
    ['long title', { title: 'x'.repeat(LIMITS.title + 1), 'option-0': 'a', 'option-1': 'b' }, `Title must be at most ${LIMITS.title} characters`],
    ['long option', { title: 't', 'option-0': 'a', 'option-1': 'y'.repeat(LIMITS.option + 1) }, `Each option must be at most ${LIMITS.option} characters`],
    ['long description', { title: 't', description: 'd'.repeat(LIMITS.description + 1), 'option-0': 'a', 'option-1': 'b' }, `Description must be at most ${LIMITS.description} characters`],
  ])('rejects %s', (_n, entries, error) => {
    expect(parsePollForm(fd(entries))).toEqual({ ok: false, error });
  });

  it('rejects more than the maximum number of options', () => {
    const entries: Record<string, string> = { title: 't' };
    for (let i = 0; i <= LIMITS.maxOptions; i++) entries[`option-${i}`] = `o${i}`;
    expect(parsePollForm(fd(entries))).toEqual({ ok: false, error: `At most ${LIMITS.maxOptions} options are allowed` });
  });
});

describe('poll settings in parsePollForm', () => {
  const NOW = new Date('2030-01-01T00:00:00Z');
  const base = { title: 't', 'option-0': 'a', 'option-1': 'b' };

  it('reads closing time, login requirement and visibility', () => {
    const r = parsePollForm(
      fd({ ...base, closes_at: '2030-01-02T10:30:00.000Z', require_login: 'on', results_visibility: 'after_close' }),
      NOW,
    );
    expect(r).toMatchObject({
      ok: true,
      value: { closesAt: '2030-01-02T10:30:00.000Z', requireLogin: true, resultsVisibility: 'after_close' },
    });
  });

  it('normalises an offset timestamp to UTC', () => {
    const r = parsePollForm(fd({ ...base, closes_at: '2030-01-02T12:30:00+02:00' }), NOW);
    expect(r).toMatchObject({ ok: true, value: { closesAt: '2030-01-02T10:30:00.000Z' } });
  });

  it('treats a blank closing time as none', () => {
    expect(parsePollForm(fd({ ...base, closes_at: '  ' }), NOW)).toMatchObject({ ok: true, value: { closesAt: null } });
  });

  it.each([
    ['in the past', '2029-12-31T23:59:59Z', 'The closing time must be in the future'],
    ['exactly now', '2030-01-01T00:00:00Z', 'The closing time must be in the future'],
    ['a bare local time with no offset', '2030-01-02T10:30', 'The closing time is not a valid date and time'],
    ['garbage', 'tomorrow', 'The closing time is not a valid date and time'],
    ['an impossible date', '2030-02-31T10:00:00Z', 'The closing time is not a valid date and time'],
  ])('rejects a closing time %s', (_n, closes_at, error) => {
    expect(parsePollForm(fd({ ...base, closes_at }), NOW)).toEqual({ ok: false, error });
  });

  it('rejects an unknown visibility value', () => {
    expect(parsePollForm(fd({ ...base, results_visibility: 'never' }), NOW)).toEqual({
      ok: false,
      error: 'Results visibility must be "always" or "after_close"',
    });
  });

  it('defaults to open to all, results always, no login', () => {
    expect(parsePollForm(fd(base), NOW)).toMatchObject({
      ok: true,
      value: { closesAt: null, requireLogin: false, resultsVisibility: 'always' },
    });
  });
});

describe('parsePollSettings', () => {
  it('accepts booleans from callers that are not forms', () => {
    expect(parsePollSettings({ requireLogin: true, resultsVisibility: 'after_close' })).toEqual({
      ok: true,
      value: { closesAt: null, requireLogin: true, resultsVisibility: 'after_close' },
    });
  });
  it('ignores non-string closing times instead of throwing', () => {
    expect(parsePollSettings({ closesAt: 12345 })).toMatchObject({ ok: true, value: { closesAt: null } });
  });
});

describe('parsePollEdit', () => {
  it('trims and requires id and title', () => {
    expect(parsePollEdit(fd({ id: 'x', title: ' T ', description: ' d ' }))).toEqual({ ok: true, value: { id: 'x', title: 'T', description: 'd' } });
    expect(parsePollEdit(fd({ title: 'T' }))).toEqual({ ok: false, error: 'Missing poll id' });
    expect(parsePollEdit(fd({ id: 'x', title: ' ' }))).toEqual({ ok: false, error: 'Title is required' });
  });
});
