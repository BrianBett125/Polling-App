# Authentication and account

## Pages

| Path | Purpose |
| --- | --- |
| `/auth` | Sign in and sign up. Shows friendly errors from `lib/auth-errors.ts`. Has a "Forgot password?" link in sign-in mode. |
| `/auth/forgot` | Email form that calls `resetPasswordForEmail`. |
| `/auth/callback` | Route handler. Exchanges the `code` from an email link for a session cookie, then redirects to `next` (checked by `safeNextPath`, same-site paths only). |
| `/auth/reset` | Set a new password (min 6 characters, confirm must match) with `updateUser`. |
| `/account` | Protected by middleware. Shows the email, a change-password form and the delete-account danger zone. |

## Password reset flow

1. User submits `/auth/forgot`. The client calls `resetPasswordForEmail(email, { redirectTo: <origin>/auth/callback?next=/auth/reset })`.
2. The page always shows the same neutral message ("If an account exists for that email...") whether or
   not the address exists, so it cannot be used to enumerate accounts. Rate-limit errors are the one
   exception and are shown, because they are about the caller, not the account.
3. The emailed link opens `/auth/callback?code=...&next=/auth/reset`. The callback exchanges the code
   (PKCE, using the code verifier cookie set in the same browser) and redirects to `/auth/reset`.
4. `/auth/reset` needs a session. With none it shows "Link expired" and a button to `/auth/forgot`.
   If the code exchange itself fails, the callback sends the user to `/auth/forgot?error=expired`.
5. On success the user is redirected to `/polls`.

Requirements for the link to work:

- The reset must be requested and opened in the same browser (PKCE verifier cookie). Opening the mail on
  another device lands on "Link expired"; the user requests a new one there.
- The callback URL must be on Supabase's Redirect URLs allow list, see [EMAIL.md](./EMAIL.md).
- Links are single use and expire (default 1 hour).
- `/auth/reset` accepts any signed-in session, not only a recovery one. That is fine: a signed-in user
  can already change their password from `/account`.

## Captcha

When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set, sign in, sign up and forgot password render the Turnstile
widget, block submit until a token exists, send it to Supabase as `captchaToken`, and request a new
challenge after every attempt that does not navigate away. Enable the matching secret in Supabase
Authentication > Bot and Abuse Protection (Cloudflare Turnstile). With no site key nothing changes.
Supabase verifies the token for these auth calls, so the secret must be set there or tokens are
ignored.

## Account deletion

`deleteAccountAction(confirmEmail)` in `lib/actions-account.ts`, in this order:

1. Verifies the user with `getCurrentUser` (asks Supabase Auth, not just the cookie). Not signed in: `not_authenticated`.
2. Compares the typed email to the verified user's email, trimmed and case-insensitive. This is
   enforced on the server; the disabled button in the UI is only a convenience.
3. Rate limit `withinRateLimit('deleteAccount', user.id)` (3 per hour). Over budget: `RATE_LIMITED_MESSAGE`.
4. Needs `SUPABASE_SERVICE_ROLE_KEY` (`getAdminSupabase()`); otherwise a friendly "not available" error.
5. `auth.admin.deleteUser(user.id)`. The database cascades: the user's polls, and with them options and
   votes, are deleted. The action deletes no rows by hand. Votes the user cast on other people's polls
   stay, with the user reference cleared (see the header of
   `supabase/migrations/20251007000000_robustness.sql` for the exact foreign key behavior).
6. Signs the session out (clears cookies) and revalidates `/polls`. The client then does a full
   navigation to `/`.

Deletion is permanent. There is no soft delete or grace period.

## What you must configure in Supabase

- Authentication > URL Configuration: Site URL and the Redirect URLs listed in [EMAIL.md](./EMAIL.md).
- Authentication > SMTP Settings: custom SMTP (Resend), or turn off "Confirm email". See [EMAIL.md](./EMAIL.md).
- Authentication > Bot and Abuse Protection: Turnstile secret, only if you set the site key.
- Apply migration `20251007000000_robustness.sql` (cascade on user delete, `check_rate_limit`).
- Vercel env: `SUPABASE_SERVICE_ROLE_KEY` (server only, no `NEXT_PUBLIC_` prefix) for account deletion.

## Error messages

`friendlyAuthError(error)` matches the Supabase error `code` first, then the message, and falls back to
a generic string, so raw backend text is never shown. Add new cases to `lib/auth-errors.ts` with a test
in `lib/auth-errors.test.ts`.

## Re-authentication for account deletion

Deleting an account requires a sign-in within the last 15 minutes (`last_sign_in_at`; refreshing a token does not count). Otherwise the page offers "Sign out and sign in again", which returns to `/account`. The typed-email confirmation is still checked on the server.

## Forgot password and rate limits

The page shows an error only for limits that apply to everyone (the project email budget, the per-IP limit). The per-account throttle ("you can only request this after N seconds") is hidden, because it would reveal that an address has an account.
