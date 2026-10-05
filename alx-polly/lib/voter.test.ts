import { describe, expect, it } from 'vitest';
import { isVoterSecret, newVoterSecret, voterCookieOptions, voterToken } from './voter';

describe('voter identity', () => {
  it('generates distinct 256-bit hex secrets', () => {
    const a = newVoterSecret();
    const b = newVoterSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('accepts only well-formed secrets', () => {
    expect(isVoterSecret(newVoterSecret())).toBe(true);
    for (const bad of [undefined, null, '', 'abc', 'G'.repeat(64), 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 42]) {
      expect(isVoterSecret(bad)).toBe(false);
    }
  });

  it('hashes deterministically to the 64-hex shape the database requires', () => {
    const s = newVoterSecret();
    expect(voterToken(s)).toBe(voterToken(s));
    expect(voterToken(s)).toMatch(/^[0-9a-f]{64}$/);
    expect(voterToken(s)).not.toBe(s);
    expect(voterToken(newVoterSecret())).not.toBe(voterToken(s));
  });

  it('matches a known SHA-256 vector', () => {
    // sha256("abc")
    expect(voterToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('issues httpOnly, lax, site-wide, long-lived cookies', () => {
    expect(voterCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 31536000 });
  });
});
