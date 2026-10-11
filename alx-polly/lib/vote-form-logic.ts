import type { ActionResult } from './types/action-result';

/** Sign-in link that returns the visitor to the poll. The poll id is a uuid, but encode anyway. */
export function signInHref(pollId: string): string {
  return `/auth?next=${encodeURIComponent(`/polls/${pollId}`)}`;
}

/** The submit button is live only with a choice, no request in flight, and (when required) a captcha token. */
export function canSubmit(s: { selected: string | null; pending: boolean; captchaRequired: boolean; token: string | null }): boolean {
  return !!s.selected && !s.pending && (!s.captchaRequired || !!s.token);
}

export type VoteOutcome = {
  /** Show this text in the alert region, if any. */
  message: string | null;
  /** Re-render the server component (vote stored, already voted, or poll now closed). */
  refresh: boolean;
  /** Tokens are single use: any non-success needs a fresh challenge. */
  resetCaptcha: boolean;
};

export function outcomeOf(result: ActionResult<{ voteId: string }>): VoteOutcome {
  if (result.success) return { message: null, refresh: true, resetCaptcha: false };
  switch (result.code) {
    case 'already_voted':
    case 'closed':
      return { message: result.error, refresh: true, resetCaptcha: true };
    default:
      // rate_limited, captcha_failed, login_required and plain failures all keep the form usable.
      return { message: result.error, refresh: false, resetCaptcha: true };
  }
}
