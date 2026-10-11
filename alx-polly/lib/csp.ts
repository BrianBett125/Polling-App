/**
 * Content-Security-Policy builder. Pure: takes the environment, returns the header value.
 *
 * Next.js App Router emits inline bootstrap scripts, so script-src needs 'unsafe-inline'
 * (a nonce would need per-request middleware and dynamic rendering for every page).
 * The policy still blocks: foreign script hosts, plugins (object-src), base tag hijack,
 * form posts to other origins, framing by other sites, and data: or blob: scripts.
 */
export type CspEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(env: CspEnv = process.env): string {
  const dev = env.NODE_ENV === 'development';
  const prod = env.NODE_ENV === 'production';
  const supabase = originOf(env.NEXT_PUBLIC_SUPABASE_URL);

  const scriptSrc = ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), 'https://challenges.cloudflare.com', 'https://va.vercel-scripts.com'];
  const connectSrc = [
    "'self'",
    ...(supabase ? [supabase] : []),
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://vitals.vercel-insights.com',
    'https://va.vercel-scripts.com',
    ...(dev ? ['ws://localhost:*', 'ws://127.0.0.1:*'] : []),
  ];

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${[...new Set(connectSrc)].join(' ')}`,
    'frame-src https://challenges.cloudflare.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ];
  if (prod) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

export const SECURITY_HEADERS_STATIC = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
] as const;
