import { describe, it, expect } from 'vitest';
import { validateNewPassword, emailMatches } from './password-form';

describe('validateNewPassword', () => {
  it('requires 6 characters', () => {
    expect(validateNewPassword('12345', '12345')).toMatch(/at least 6/);
    expect(validateNewPassword('', '')).toMatch(/at least 6/);
  });
  it('requires the confirmation to match', () => {
    expect(validateNewPassword('abcdef', 'abcdeg')).toMatch(/do not match/);
    expect(validateNewPassword('abcdef', 'ABCDEF')).toMatch(/do not match/);
  });
  it('accepts a matching password of 6+ characters', () => {
    expect(validateNewPassword('abcdef', 'abcdef')).toBeNull();
  });
});

describe('emailMatches', () => {
  it('ignores case and surrounding spaces', () => {
    expect(emailMatches(' Ann@Example.com ', 'ann@example.com')).toBe(true);
  });
  it('rejects other text and missing emails', () => {
    expect(emailMatches('bob@example.com', 'ann@example.com')).toBe(false);
    expect(emailMatches('', '')).toBe(false);
    expect(emailMatches('x', undefined)).toBe(false);
  });
});
