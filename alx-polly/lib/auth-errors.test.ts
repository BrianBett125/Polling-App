import { describe, it, expect } from 'vitest';
import { friendlyAuthError, isRateLimitError, GENERIC_AUTH_ERROR } from './auth-errors';

describe('friendlyAuthError', () => {
  it.each([
    [{ message: 'email rate limit exceeded' }, /too many emails/i],
    [{ message: 'Invalid login credentials' }, /incorrect email or password/i],
    [{ message: 'Email not confirmed' }, /confirm your email/i],
    [{ message: 'User already registered' }, /already exists/i],
    [{ message: 'Password should be at least 6 characters.' }, /too weak/i],
    [{ message: 'Unable to validate email address: invalid format' }, /not valid/i],
    [{ message: 'captcha verification process failed' }, /human check/i],
    [{ message: 'New password should be different from the old password.' }, /different/i],
    [{ message: 'Auth session missing!' }, /session has expired/i],
    [{ message: 'Email link is invalid or has expired' }, /link has expired/i],
    [{ message: 'For security purposes, you can only request this after 45 seconds.' }, /too many attempts/i],
    [{ message: 'Failed to fetch' }, /could not reach/i],
    [{ message: 'Signups not allowed for this instance' }, /turned off/i],
  ])('maps message %j', (err, expected) => {
    expect(friendlyAuthError(err)).toMatch(expected);
  });

  it.each([
    ['over_request_rate_limit', /too many attempts/i],
    ['over_email_send_rate_limit', /too many emails/i],
    ['invalid_credentials', /incorrect email or password/i],
    ['email_not_confirmed', /confirm your email/i],
    ['user_already_exists', /already exists/i],
    ['weak_password', /too weak/i],
    ['captcha_failed', /human check/i],
    ['otp_expired', /expired/i],
  ])('maps code %s', (code, expected) => {
    expect(friendlyAuthError({ code, message: 'raw backend text' })).toMatch(expected);
  });

  it('prefers the code over the message', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials', message: 'email rate limit exceeded' })).toMatch(/incorrect/i);
  });

  it('never leaks raw text for unknown errors', () => {
    const out = friendlyAuthError({ code: 'weird', message: 'pg: relation "auth.users" exploded' });
    expect(out).toBe(GENERIC_AUTH_ERROR);
    expect(out).not.toMatch(/auth\.users/);
  });

  it('handles null, strings and odd shapes', () => {
    expect(friendlyAuthError(null)).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(undefined)).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(42)).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError('Invalid login credentials')).toMatch(/incorrect/i);
    expect(friendlyAuthError({ message: 123 })).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(new Error('Email not confirmed'))).toMatch(/confirm/i);
  });
});

describe('isRateLimitError', () => {
  it('detects by code and by message', () => {
    expect(isRateLimitError({ code: 'over_request_rate_limit', message: 'x' })).toBe(true);
    expect(isRateLimitError({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(true);
    expect(isRateLimitError({ message: 'email rate limit exceeded' })).toBe(true);
    expect(isRateLimitError({ message: 'For security purposes, you can only request this after 5 seconds.' })).toBe(true);
  });
  it('is false for other failures', () => {
    expect(isRateLimitError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError({ code: 'user_not_found', message: 'User not found' })).toBe(false);
  });
});
