import { describe, expect, it } from 'vitest';
import { GENERIC_VOTE_ERROR, isAlreadyVoted, messageForDbError } from './vote-errors';

describe('vote error mapping', () => {
  it.each(['VT001', 'VT002', 'VT003', 'VT004', 'VT005', 'VT006', 'VT007'])('has a message for %s', (code) => {
    expect(messageForDbError({ code }, 'fallback')).not.toBe('fallback');
  });

  it('falls back for unknown, missing or non-object errors, never echoing the raw text', () => {
    for (const e of [{ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, {}, null, undefined, 'boom', { code: 42 }]) {
      expect(messageForDbError(e, GENERIC_VOTE_ERROR)).toBe(GENERIC_VOTE_ERROR);
    }
  });

  it('recognises only the already-voted code', () => {
    expect(isAlreadyVoted({ code: 'VT002' })).toBe(true);
    expect(isAlreadyVoted({ code: 'VT003' })).toBe(false);
    expect(isAlreadyVoted(null)).toBe(false);
  });
});
