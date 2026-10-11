export const MIN_PASSWORD_LENGTH = 6;

/** Client-side check for "new password + confirm" forms. Returns an error message or null. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}

/** True when the typed text equals the account email (trimmed, case-insensitive). */
export function emailMatches(typed: string, actual: string | null | undefined): boolean {
  return !!actual && typed.trim().toLowerCase() === actual.trim().toLowerCase();
}
