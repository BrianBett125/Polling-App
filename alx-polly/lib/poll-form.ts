export const LIMITS = { title: 200, description: 2000, option: 200, minOptions: 2, maxOptions: 20 } as const;

export type ResultsVisibilityValue = 'always' | 'after_close';
export type PollSettings = {
  /** UTC ISO timestamp, or null for "no closing time". */
  closesAt: string | null;
  requireLogin: boolean;
  resultsVisibility: ResultsVisibilityValue;
};
export type PollFormValue = { title: string; description: string; options: string[] } & PollSettings;
export type ParseResult = { ok: true; value: PollFormValue } | { ok: false; error: string };

// An absolute instant: date, time and an explicit offset. A bare local time (no Z or offset) would be read
// in the server's timezone, which is exactly the bug the client-side conversion exists to avoid.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** V8 rolls 2030-02-31 over to March 3rd; a closing time must be a real calendar instant. */
function isRealCalendarTime(iso: string): boolean {
  const [, y, mo, d, h, mi, sec] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso) ?? [];
  if (!y) return false;
  const daysInMonth = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate();
  return Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= daysInMonth && Number(h) <= 23 && Number(mi) <= 59 && Number(sec ?? 0) <= 59;
}

export type SettingsResult = { ok: true; value: PollSettings } | { ok: false; error: string };

/**
 * Validates the lifecycle settings. `closesAtRaw` is the browser's conversion of the local
 * date-time to UTC ISO. Empty means no closing time. It must be in the future; the database
 * checks again with its own clock on creation.
 */
export function parsePollSettings(
  raw: { closesAt?: unknown; requireLogin?: unknown; resultsVisibility?: unknown },
  now: Date = new Date(),
): SettingsResult {
  const closesText = typeof raw.closesAt === 'string' ? raw.closesAt.trim() : '';
  let closesAt: string | null = null;
  if (closesText) {
    const ms = ISO_WITH_OFFSET.test(closesText) && isRealCalendarTime(closesText) ? Date.parse(closesText) : NaN;
    if (!Number.isFinite(ms)) return { ok: false, error: 'The closing time is not a valid date and time' };
    if (ms <= now.getTime()) return { ok: false, error: 'The closing time must be in the future' };
    closesAt = new Date(ms).toISOString();
  }

  const visibility = typeof raw.resultsVisibility === 'string' && raw.resultsVisibility ? raw.resultsVisibility : 'always';
  if (visibility !== 'always' && visibility !== 'after_close') {
    return { ok: false, error: 'Results visibility must be "always" or "after_close"' };
  }

  // A checkbox posts "on" when ticked and nothing when not.
  const requireLogin = raw.requireLogin === 'on' || raw.requireLogin === 'true' || raw.requireLogin === true;
  return { ok: true, value: { closesAt, requireLogin, resultsVisibility: visibility } };
}

/** Rules for a cleaned (trimmed, non-blank) option list. Returns an error message, or null when fine. */
export function validateOptions(options: string[]): string | null {
  if (options.length < LIMITS.minOptions) return 'At least two options are required';
  if (options.length > LIMITS.maxOptions) return `At most ${LIMITS.maxOptions} options are allowed`;
  if (options.some((o) => o.length > LIMITS.option)) return `Each option must be at most ${LIMITS.option} characters`;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return 'Options must be different from each other';
  return null;
}

/** Trim every entry and drop blanks, as the database does. */
export function cleanOptions(raw: unknown[]): string[] {
  return raw.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean);
}

/** Validate the create-poll form. Mirrors the database limits so users get friendly errors first. */
export function parsePollForm(formData: FormData, now: Date = new Date()): ParseResult {
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  const options = Array.from(formData.keys())
    .filter((k) => /^option-\d+$/.test(k))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
    .map((k) => String(formData.get(k) ?? '').trim())
    .filter(Boolean);

  if (!title) return { ok: false, error: 'Title is required' };
  if (title.length > LIMITS.title) return { ok: false, error: `Title must be at most ${LIMITS.title} characters` };
  if (description.length > LIMITS.description) {
    return { ok: false, error: `Description must be at most ${LIMITS.description} characters` };
  }
  const optionsError = validateOptions(options);
  if (optionsError) return { ok: false, error: optionsError };

  const settings = parsePollSettings(
    {
      closesAt: formData.get('closes_at'),
      requireLogin: formData.get('require_login'),
      resultsVisibility: formData.get('results_visibility'),
    },
    now,
  );
  if (!settings.ok) return settings;
  return { ok: true, value: { title, description, options, ...settings.value } };
}

/** Validate the edit-poll form (title and description only; settings go through updatePollSettingsAction). */
export function parsePollEdit(formData: FormData):
  | { ok: true; value: { id: string; title: string; description: string } }
  | { ok: false; error: string } {
  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing poll id' };
  if (!title) return { ok: false, error: 'Title is required' };
  if (title.length > LIMITS.title) return { ok: false, error: `Title must be at most ${LIMITS.title} characters` };
  if (description.length > LIMITS.description) {
    return { ok: false, error: `Description must be at most ${LIMITS.description} characters` };
  }
  return { ok: true, value: { id, title, description } };
}

/**
 * `<input type="datetime-local">` value ("2030-01-02T10:30", no offset) to a UTC ISO instant, read in the
 * BROWSER's timezone. Call this in the client: the server's timezone is not the user's. Empty or invalid gives "".
 */
export function localInputToIso(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return '';
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  // Reject rollovers such as 31 February.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return '';
  return date.toISOString();
}

/** UTC ISO instant to a `datetime-local` value in the browser's timezone (the inverse of localInputToIso). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}
