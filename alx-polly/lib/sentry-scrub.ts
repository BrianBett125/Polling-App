/**
 * Removes secrets from an error event before it leaves the process. Used as Sentry's `beforeSend`.
 * Kept free of Sentry imports so it is unit-testable and cannot pull the SDK into a bundle.
 */

const REDACTED = '[redacted]';
const SENSITIVE_HEADER = /cookie|authorization|token|secret|api[-_]?key|apikey|session/i;
const SENSITIVE_PARAM = /^(code|token|access_token|refresh_token|id_token|apikey|api_key|key|secret|password|state)$/i;

type Bag = Record<string, unknown>;

export type ScrubbableEvent = {
  request?: {
    url?: string;
    cookies?: unknown;
    headers?: Record<string, unknown>;
    query_string?: unknown;
    data?: unknown;
    [k: string]: unknown;
  };
  user?: Bag;
  extra?: Bag;
  breadcrumbs?: Array<{ data?: Bag; [k: string]: unknown }>;
  [k: string]: unknown;
};

function scrubUrl(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder.invalid');
    let changed = false;
    for (const key of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_PARAM.test(key)) {
        u.searchParams.set(key, REDACTED);
        changed = true;
      }
    }
    if (!changed) return url;
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
    return isAbsolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

function scrubQueryString(qs: unknown): unknown {
  if (typeof qs !== 'string') return qs === undefined ? qs : REDACTED;
  const params = new URLSearchParams(qs);
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_PARAM.test(key)) params.set(key, REDACTED);
  }
  return params.toString();
}

function scrubHeaders(h: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(h)) out[k] = SENSITIVE_HEADER.test(k) ? REDACTED : v;
  return out;
}

/** Trace sample rate from an env string: a number in 0..1, otherwise the default (0.1). */
export function parseSampleRate(raw: string | undefined, fallback = 0.1): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/** Returns the same event with cookies, sensitive headers, request bodies, user PII and secret URL params removed. */
export function scrubEvent<T extends object>(input: T): T {
  // Structurally typed on purpose: Sentry's ErrorEvent has no index signature, so it cannot be
  // declared to extend ScrubbableEvent, but every field touched here exists on it.
  const event = input as ScrubbableEvent;
  if (event.request) {
    const r = event.request;
    delete r.cookies;
    delete r.data; // request bodies can hold passwords and vote tokens
    if (r.headers) r.headers = scrubHeaders(r.headers);
    if (typeof r.url === 'string') r.url = scrubUrl(r.url);
    if (r.query_string !== undefined) r.query_string = scrubQueryString(r.query_string);
  }
  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
    delete event.user.username;
  }
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.data && typeof b.data.url === 'string') b.data.url = scrubUrl(b.data.url);
      if (b.data && typeof b.data === 'object' && 'headers' in b.data) delete b.data.headers;
    }
  }
  return input;
}
