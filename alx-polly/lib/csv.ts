import { computeResults, type ResultInput } from './results';

/** Characters that make a spreadsheet read a cell as a formula (OWASP "CSV injection"). */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Text starting with = + - @ tab or CR gets a single quote in front so Excel, Sheets and
 * LibreOffice show it as text instead of running it. Then RFC 4180 quoting: wrap in double quotes when
 * the cell holds a comma, quote, CR or LF, and double any inner quote.
 * Numbers are written as-is (they come from counts, never from user text).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

export type PollCsvInput = {
  title: string;
  isClosed: boolean;
  /** UTC ISO instant, or null. Written as ISO so the file is timezone-unambiguous. */
  closesAt: string | null;
  options: ResultInput[];
};

/**
 * The export file: a small header block (poll, status, total), a blank line, then one row per option
 * with votes and the same whole-number percentages the results page shows (they add up to 100).
 * Lines end in CRLF as RFC 4180 asks.
 */
export function buildPollCsv(input: PollCsvInput): string {
  const { total, rows } = computeResults(input.options);
  const lines = [
    csvRow(['Poll', input.title]),
    csvRow(['Status', input.isClosed ? 'Closed' : 'Open']),
    ...(input.closesAt ? [csvRow(['Closes at (UTC)', input.closesAt])] : []),
    csvRow(['Total votes', total]),
    '',
    csvRow(['Option', 'Votes', 'Percent']),
    ...rows.map((r) => csvRow([r.text, r.votes, r.percent])),
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Byte order mark so Excel opens the UTF-8 file with accents, emoji and non-Latin scripts intact. */
export const UTF8_BOM = '﻿';

/** `poll-<slug>.csv`: ASCII only, so it is safe in a Content-Disposition header. */
export function csvFilename(title: string, id: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `poll-${slug || id.slice(0, 8)}.csv`;
}
