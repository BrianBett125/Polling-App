/**
 * Maps database error codes raised by supabase/migrations to messages that are
 * safe to show visitors. Anything unrecognised becomes a generic message, so raw
 * database text (table names, SQL state) never reaches the browser.
 */
const MESSAGES: Record<string, string> = {
  VT001: 'We could not identify your browser. Enable cookies and try again.',
  VT002: 'You have already voted on this poll from this browser.',
  VT003: 'This poll no longer exists.',
  VT004: 'That option is not part of this poll. Reload the page and try again.',
  VT005: 'Please sign in to create a poll.',
  VT006: 'Poll titles must be between 1 and 200 characters.',
  VT007: 'A poll needs between 2 and 20 options, each up to 200 characters.',
  VT008: 'Options cannot be added after voting has started.',
};

export const GENERIC_VOTE_ERROR = 'Something went wrong while recording your vote. Please try again.';
export const GENERIC_CREATE_ERROR = 'Something went wrong while creating the poll. Please try again.';

export function messageForDbError(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && MESSAGES[code] ? MESSAGES[code] : fallback;
}

/** True when the failure means the browser already voted (state worth showing as "voted"). */
export function isAlreadyVoted(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'VT002';
}
