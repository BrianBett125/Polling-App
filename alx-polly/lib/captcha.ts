// Cloudflare Turnstile, optional. Nothing is enforced until both keys exist:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (browser widget)
//   TURNSTILE_SECRET_KEY            (server verification, never NEXT_PUBLIC_)
// Sign-up uses Supabase's own CAPTCHA check (Authentication > Bot and Abuse Protection, same secret),
// to which the browser passes the token; votes are verified here.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function isCaptchaConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.TURNSTILE_SECRET_KEY && !!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/**
 * True when the visitor passes. With no secret configured it returns true (feature off).
 * With a secret, a missing token, a failed check, or an unreachable verifier all return false:
 * failing open would let a bot skip the check by blocking our request to Cloudflare.
 */
export async function verifyCaptcha(
  token: string | null | undefined,
  remoteIp?: string | null,
  deps: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const env = deps.env ?? process.env;
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 4096) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const res = await (deps.fetchImpl ?? fetch)(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
