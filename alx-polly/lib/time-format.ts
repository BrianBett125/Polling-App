// Date and time text for polls. Kept out of the component so it can be unit tested.
//
// Do not combine dateStyle/timeStyle with timeZoneName: Intl throws "Invalid option" for that mix.
// Explicit fields are allowed to carry a time zone name.

const FIELDS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/** "5 Mar 2026, 10:30 UTC" style text in UTC. Used on the server and for the first client render. */
export function formatUtc(date: Date, locale: string | undefined = 'en-GB'): string {
  return `${new Intl.DateTimeFormat(locale, { ...FIELDS, timeZone: 'UTC' }).format(date)} UTC`;
}

/** The same moment in the visitor's own timezone, with its short name so "10:30" is never ambiguous. */
export function formatLocal(date: Date, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { ...FIELDS, timeZoneName: 'short', ...(timeZone ? { timeZone } : {}) }).format(date);
}
