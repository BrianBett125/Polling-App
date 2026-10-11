# Security notes: voting, abuse controls, headers

## Voting threat model

A vote is an anonymous write to a public URL. Each layer below stops something specific. None of them proves a person is unique.

| Layer | Where | Stops | Does not stop |
| --- | --- | --- | --- |
| Signed voter cookie (HMAC, httpOnly) | `middleware.ts`, `lib/voter.ts` | A client inventing or rotating voter ids by hand-editing a cookie | A person who clears cookies, uses a private window, or another browser |
| One vote per (poll, token) | `votes` unique index, `cast_vote` | Double voting from one browser, including two simultaneous requests | Fresh cookies |
| Per-IP rate limit (30 votes / 10 min) | `lib/rate-limit.ts`, `check_rate_limit` | A script on one address hammering polls, cookie clearing in a loop | Many addresses (botnet), or many people behind one NAT sharing the budget |
| Turnstile (when configured) | `components/Turnstile.tsx`, `lib/captcha.ts` | Simple scripts and headless clients that cannot solve the challenge | Paid solving services, humans voting repeatedly with fresh cookies |
| Login-only polls | `cast_vote` (VT010, VT002 by `user_id`) | Anonymous voting; a second vote by the same account from another browser | Someone with many accounts (sign-up is rate limited and captcha protected, see below) |
| Closed polls | `cast_vote` (VT009) | Votes after `closes_at` or manual close, enforced in the database, not the UI | Nothing: the clock is the database clock |

Order of checks in `voteForOption`: id validation, service role present, rate limit, captcha, voter cookie, account lookup, `cast_vote`. The cheap, anonymous-safe checks run first. The rate limiter counts every attempt, including ones the captcha then rejects, so failed attempts spend budget.

Identity inputs always come from the server: the account id is read from the Supabase session, never from the client, and the IP comes from `x-forwarded-for`, which Vercel sets itself. Behind a different proxy that does not overwrite that header, a client could spoof its IP and dodge the limiter. Keep the app on Vercel or strip the header at your edge.

Failure modes by design:

- Rate limit store unreachable: the limiter fails open and logs. An outage should not block every vote. The cookie and database rules still apply.
- Captcha secret set but Cloudflare unreachable, or token missing: the vote is refused. Failing open here would let a bot skip the check by blocking our request.
- No captcha keys set: captcha is off and nothing is enforced.

## Rate limits

| Action | Budget | Keyed by | Enforced by |
| --- | --- | --- | --- |
| Vote | 30 per 10 minutes | Client IP (hashed) | `voteForOption` via `check_rate_limit` |
| Create poll | 10 per hour | Account id (hashed) | `createPoll` |
| Delete account | 3 per hour | Account id (hashed) | account deletion action |
| Sign-up, sign-in, password reset | Supabase built-in limits | Supabase (IP and email) | Supabase Auth, plus Turnstile on sign-up |

Sign-up and sign-in are deliberately not limited by app code. Supabase Auth applies its own per-IP and per-email limits (tune them in the dashboard under Authentication > Rate Limits). Turnstile adds a challenge on top when Bot and Abuse Protection is enabled, see below. A second counter in the app would be weaker than the one on the auth server.

## Turnstile setup

1. In the Cloudflare dashboard open Turnstile and add a widget. Add your production hostname (and `localhost` if you want it in development). Mode: Managed.
2. Copy the site key and the secret key.
3. In Vercel project settings, add environment variables:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = site key (public, baked in at build time, so redeploy after adding it)
   - `TURNSTILE_SECRET_KEY` = secret key (server only, never prefix with `NEXT_PUBLIC_`)
4. In the Supabase dashboard open Authentication > Bot and Abuse Protection, enable CAPTCHA protection, choose Turnstile, and paste the same secret key. Without this step sign-up is not verified, even though the widget shows. Supabase then rejects sign-ups that arrive without a valid token.
5. Redeploy. Open a poll: the widget appears above the submit button, which stays disabled until the check passes.

To turn it off, remove both variables and redeploy. Removing only one leaves the feature off (`isCaptchaConfigured` needs both).

## Security headers and CSP

Set in `next.config.ts`; the policy is built by `lib/csp.ts` (pure function, unit tested).

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | see below |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

CSP directives:

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com` (`'unsafe-eval'` added only when `NODE_ENV=development`, for React refresh)
- `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self' data:`
- `connect-src 'self'`, the `NEXT_PUBLIC_SUPABASE_URL` origin, `https://*.supabase.co`, `wss://*.supabase.co`, Sentry ingest hosts, Vercel vitals hosts
- `frame-src https://challenges.cloudflare.com`
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`
- `upgrade-insecure-requests` only where the site is served over https: on Vercel (it sets `VERCEL`), or when you set `CSP_UPGRADE_INSECURE_REQUESTS=1`. On plain `http://localhost` it would rewrite Next.js's own fetches to https and make every page update crawl

Known limits:

- `'unsafe-inline'` in `script-src` is a concession to the Next.js App Router, which emits inline bootstrap scripts. It means the policy does not stop an injected inline script. It still blocks foreign script hosts, plugins, base tag hijacking, cross-origin form posts and framing by other sites. React escapes output and the app renders no raw HTML, which is the primary XSS defence. A nonce-based policy needs per-request middleware and dynamic rendering of every page; revisit if the app ever renders user HTML.
- HSTS is sent by the app; browsers ignore it over plain HTTP, so local development is unaffected. `includeSubDomains` commits every subdomain of your domain to HTTPS. Do not add `preload` unless you intend to submit the domain to the preload list.
- The build bakes `NEXT_PUBLIC_SUPABASE_URL` into the header. Change it and you must redeploy.

How to verify after a deploy: open a poll in a browser with devtools open, confirm the console shows no "Refused to ..." CSP errors, the Turnstile widget renders, a vote succeeds, and sign-in works. `curl -sI <url>` shows the headers.

## Review hardening notes

- **Client address:** rate limits key on the first `x-forwarded-for` hop. That header is trustworthy on Vercel, which sets it. Behind another proxy that appends to a client-supplied header, a caller can pick their own bucket, so put a proxy in front that overwrites it. When no address is available, the per-client vote limit steps aside instead of putting everyone in one shared bucket; Turnstile and the database rules still apply.
- **Captcha misconfiguration fails closed:** if `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set but `TURNSTILE_SECRET_KEY` is not, votes are refused and an error is logged, instead of showing a widget nothing checks.
- **CSP:** `script-src` keeps `unsafe-inline` because Next.js emits inline bootstrap scripts; a nonce-based policy is the follow-up. `connect-src` allows only your exact Supabase project origin when `NEXT_PUBLIC_SUPABASE_URL` is set at build time.
- **Poll creation** is limited to 10 per hour per account by the app and 30 per hour by a database trigger, so calling the API directly does not skip the cap.
- **Option guard:** inserts into `poll_options` by anyone other than the poll owner are refused by row-level security before the voting-started check runs, so a stranger cannot probe whether a poll has votes.
- **Poll ids in responses:** `get_poll` returns the owner's account id only to the owner.
