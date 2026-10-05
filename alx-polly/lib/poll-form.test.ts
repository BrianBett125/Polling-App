import { describe, expect, it } from 'vitest';
import { LIMITS, parsePollEdit, parsePollForm } from './poll-form';

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('parsePollForm', () => {
  it('trims, drops blank options and orders by index', () => {
    const r = parsePollForm(fd({ title: '  My Poll ', description: ' d ', 'option-10': 'C', 'option-2': ' B ', 'option-1': ' A ', 'option-3': '  ' }));
    expect(r).toEqual({ ok: true, value: { title: 'My Poll', description: 'd', options: ['A', 'B', 'C'] } });
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

describe('parsePollEdit', () => {
  it('trims and requires id and title', () => {
    expect(parsePollEdit(fd({ id: 'x', title: ' T ', description: ' d ' }))).toEqual({ ok: true, value: { id: 'x', title: 'T', description: 'd' } });
    expect(parsePollEdit(fd({ title: 'T' }))).toEqual({ ok: false, error: 'Missing poll id' });
    expect(parsePollEdit(fd({ id: 'x', title: ' ' }))).toEqual({ ok: false, error: 'Title is required' });
  });
});
