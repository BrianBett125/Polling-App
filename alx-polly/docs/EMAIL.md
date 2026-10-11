# Auth email setup

Supabase sends sign-up confirmation and password reset emails. On the free built-in mailer this is
limited to a handful of emails per hour for the whole project, shared by every user, and it only
delivers to members of your Supabase organization. Users see "email rate limit exceeded" almost
immediately. Fix it with option (a) or (b).

## (a) Custom SMTP with Resend (recommended)

1. Create a Resend account and add your sending domain under Domains. Add the DNS records Resend shows
   (SPF, DKIM, and the optional DMARC record) at your DNS host, then click Verify. Wait until the
   domain status is Verified. Mail from an unverified domain is rejected.
2. In Resend, create an API key with "Sending access" and copy it (it starts with `re_`).
3. In the Supabase dashboard open Authentication > Emails > SMTP Settings (in some dashboard versions:
   Project Settings > Authentication > SMTP Settings) and turn on "Enable custom SMTP".
4. Fill in:
   - Sender email: an address on the verified domain, for example `no-reply@yourdomain.com`
   - Sender name: for example `Polly`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
5. Save. Then open Authentication > Rate Limits and raise "Rate limit for sending emails" (it defaults
   to a low number once custom SMTP is on; 30 per hour is a sane start).
6. Test: request a password reset for your own address from `/auth/forgot` and confirm the mail
   arrives.

## (b) Alternative: turn off "Confirm email"

If you do not need verified addresses, open Authentication > Sign In / Providers > Email and turn off
"Confirm email". New users are then signed in immediately and no confirmation mail is sent. The
app already handles this: when sign-up returns a session it goes straight to the app.

Trade-offs: anyone can register with an address they do not own, so a typo or a stranger's address is
accepted. Password reset emails are still sent, so you still want (a) if you offer "Forgot password?".

## (c) Rate limits that apply

Authentication > Rate Limits in the dashboard holds the numbers; defaults change between Supabase
releases, so read them there. The ones that matter here:

| Limit | What hits it | User sees |
| --- | --- | --- |
| Emails sent per hour (project wide) | sign-up confirmations, resets | "Too many emails were sent recently..." (`over_email_send_rate_limit`) |
| Per-address resend cooldown (about 60 s) | requesting a reset twice quickly | "Too many attempts..." |
| Sign-ups and sign-ins per IP | scripts, shared networks | "Too many attempts..." (`over_request_rate_limit`) |

The app maps these to friendly text in `lib/auth-errors.ts`. The forgot-password page still shows
rate-limit errors, but any other failure (including an unknown address) shows the same neutral success
message so accounts cannot be enumerated.

## (d) Site URL and Redirect URLs

Authentication > URL Configuration:

- Site URL: your production URL, for example `https://your-app.vercel.app`. Confirmation emails link
  here, so a wrong value sends users to localhost.
- Redirect URLs (allow list), add each of:
  - `https://your-app.vercel.app/auth/callback`
  - `https://your-app.vercel.app/auth/callback?next=/auth/reset`
  - `https://your-app.vercel.app/auth/reset`
  - the same three for `http://localhost:3000` while developing
  - or one wildcard per origin: `https://your-app.vercel.app/**`

If the reset link's redirect is not on the allow list, Supabase falls back to the Site URL and the user
lands on the home page instead of the reset form.

The reset flow is: email link -> `/auth/callback?code=...&next=/auth/reset` (exchanges the code for a
session cookie) -> `/auth/reset`. See [AUTH.md](./AUTH.md).

## Optional: email templates

Authentication > Emails > Templates. Keep `{{ .ConfirmationURL }}` in the "Reset Password" and
"Confirm signup" templates; the app relies on that link.
