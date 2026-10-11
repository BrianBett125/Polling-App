/**
 * Maps Supabase Auth errors to text that is safe and useful to show a visitor.
 * Matches on the machine `code` first (newer GoTrue), then on the message (older
 * responses and the client-side `fetch` failures that carry no code).
 */
export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the confirmation link.',
  user_already_exists: 'An account with this email already exists. Try signing in instead.',
  email_exists: 'An account with this email already exists. Try signing in instead.',
  weak_password: 'That password is too weak. Use at least 6 characters and avoid common passwords.',
  same_password: 'Your new password must be different from your current one.',
  over_email_send_rate_limit:
    'Too many emails were sent recently. Please wait a while before trying again, or try signing in if you already have an account.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  over_sms_send_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  captcha_failed: 'The human check failed. Please complete it again and retry.',
  validation_failed: 'Please check the details you entered and try again.',
  email_address_invalid: 'That email address is not valid.',
  signup_disabled: 'Sign-ups are currently turned off.',
  user_banned: 'This account is not allowed to sign in.',
  session_not_found: 'Your session has expired. Please sign in again.',
  session_expired: 'Your session has expired. Please sign in again.',
  reauthentication_needed: 'For your security, please sign in again before changing your password.',
  flow_state_expired: 'This link has expired. Please request a new one.',
  flow_state_not_found: 'This link has expired. Please request a new one.',
  otp_expired: 'This link has expired. Please request a new one.',
};

// Ordered: first match wins. Patterns are lower-case substrings of GoTrue messages.
const BY_MESSAGE: Array<[RegExp, string]> = [
  [/email rate limit exceeded|rate limit.*email|email.*rate limit/, BY_CODE.over_email_send_rate_limit],
  [/rate limit|too many requests|for security purposes, you can only request this after/, BY_CODE.over_request_rate_limit],
  [/invalid login credentials/, BY_CODE.invalid_credentials],
  [/email not confirmed/, BY_CODE.email_not_confirmed],
  [/user already registered|already been registered/, BY_CODE.user_already_exists],
  [/password should be at least|password is too short|weak password|password.*(too weak|easy to guess|known to be weak)/, BY_CODE.weak_password],
  [/new password should be different/, BY_CODE.same_password],
  [/captcha/, BY_CODE.captcha_failed],
  [/unable to validate email address|invalid format|email address.*invalid/, BY_CODE.email_address_invalid],
  [/signups? not allowed|signups? (are )?disabled/, BY_CODE.signup_disabled],
  [/otp.*expired|token has expired or is invalid|link.*expired|email link is invalid/, BY_CODE.otp_expired],
  [/auth session missing|session.*(missing|not found)/, BY_CODE.session_not_found],
  [/failed to fetch|networkerror|network request failed|load failed/, 'Could not reach the server. Check your connection and try again.'],
  [/not configured|environment variables are missing/, 'This site is not configured yet. Please try again later.'],
];

/**
 * True for limits that apply to everyone (the project's email budget, the per-IP request limit).
 * "Forgot password" may show these. It must NOT show the per-account throttle ("you can only request
 * this after N seconds"): that error appears only for addresses that have an account.
 */
export function isSharedRateLimitError(error: unknown): boolean {
  const { code, message } = parts(error);
  if (/you can only request this after/.test(message)) return false;
  return code === 'over_request_rate_limit' || /email rate limit exceeded/.test(message);
}

/** True when the error is any rate limit. */
export function isRateLimitError(error: unknown): boolean {
  const { code, message } = parts(error);
  if (code && /rate_limit/.test(code)) return true;
  return /rate limit|too many requests|you can only request this after/.test(message);
}

function parts(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== 'object') {
    return { code: '', message: typeof error === 'string' ? error.toLowerCase() : '' };
  }
  const e = error as { code?: unknown; message?: unknown };
  return {
    code: typeof e.code === 'string' ? e.code.toLowerCase() : '',
    message: typeof e.message === 'string' ? e.message.toLowerCase() : '',
  };
}

/** Friendly text for any auth failure. Never returns raw backend text for unknown errors. */
export function friendlyAuthError(error: unknown): string {
  const { code, message } = parts(error);
  if (code && BY_CODE[code]) return BY_CODE[code];
  for (const [re, text] of BY_MESSAGE) {
    if (re.test(message)) return text;
  }
  return GENERIC_AUTH_ERROR;
}
