import { describe, expect, it } from 'vitest';
import { canSubmit, outcomeOf, signInHref } from './vote-form-logic';

describe('signInHref', () => {
  it('returns to the poll after sign-in, encoded', () => {
    expect(signInHref('11111111-1111-4111-8111-111111111111')).toBe('/auth?next=%2Fpolls%2F11111111-1111-4111-8111-111111111111');
  });
  it('encodes hostile input so it cannot add parameters', () => {
    expect(signInHref('a&next=//evil.com')).not.toContain('&next=//');
  });
});

describe('canSubmit', () => {
  const base = { selected: 'o', pending: false, captchaRequired: false, token: null };
  it('needs a choice and no request in flight', () => {
    expect(canSubmit(base)).toBe(true);
    expect(canSubmit({ ...base, selected: null })).toBe(false);
    expect(canSubmit({ ...base, pending: true })).toBe(false);
  });
  it('needs a token only when the captcha is enabled', () => {
    expect(canSubmit({ ...base, captchaRequired: true })).toBe(false);
    expect(canSubmit({ ...base, captchaRequired: true, token: 't' })).toBe(true);
  });
});

describe('outcomeOf', () => {
  it('success refreshes without a message or reset', () => {
    expect(outcomeOf({ success: true, voteId: 'v' })).toEqual({ message: null, refresh: true, resetCaptcha: false });
  });
  it('closed and already voted refresh the page and show the message', () => {
    expect(outcomeOf({ success: false, error: 'closed', code: 'closed' })).toEqual({ message: 'closed', refresh: true, resetCaptcha: true });
    expect(outcomeOf({ success: false, error: 'dup', code: 'already_voted' })).toMatchObject({ refresh: true, message: 'dup' });
  });
  it.each(['rate_limited', 'captcha_failed', 'login_required', undefined] as const)('%s keeps the form and resets the widget', (code) => {
    expect(outcomeOf({ success: false, error: 'msg', code })).toEqual({ message: 'msg', refresh: false, resetCaptcha: true });
  });
});
