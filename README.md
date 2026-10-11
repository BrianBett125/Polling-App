# ALX Polly: polls with link and QR sharing

**Live app: https://polling-app-green.vercel.app**

Signed-in users create polls and manage their own. Anyone with a poll's link can open it, vote, and see results as vote counts and percentages. Each poll page shows a copyable link and a QR code for the same URL.

## Features

**Polls**
- Email and password registration, login, logout, password reset ("Forgot password") and an account page with change password and delete account.
- Create polls with 2 to 20 options. Optional closing time, optional "sign in to vote" rule, and a choice to show results always or only after the poll closes.
- Owners can edit title, description and settings, rewrite options until the first vote arrives, close or reopen voting, export results as CSV, and delete the poll.
- `/polls` lists your polls with search and pages of 12, plus Closed, Closes and Sign-in badges.
- Every poll lives at its own URL, `/polls/<uuid>`. The page is public: no sign-in needed to view or vote (unless the owner required it). Polls cannot be listed through the API; the link is the only way in.
- Results with per-option counts and whole-number percentages that add up to 100, refreshed every few seconds while the tab is visible.

**Sharing**
- Share panel: read-only link, "Copy link", "Share…" where the browser supports it, a QR code, and "Download QR" as PNG or SVG.
- Link previews: each poll has an Open Graph title and a generated 1200x630 card (no vote counts in it).

**Safety and operations**
- Cloudflare Turnstile on voting and sign-up, off until you set its keys. Database-backed rate limits on voting, poll creation and account deletion.
- Content-Security-Policy, HSTS and other security headers. Friendly error pages. Optional Sentry error reporting and Vercel Analytics (both off until configured). `/api/health` for uptime checks.
- A designed look: brand gradient, display type, landing page, animated results, light and dark themes, skip link, labelled forms, axe-checked pages (`docs/DESIGN.md`).
- GitHub Actions CI, a post-deploy smoke script, a live browser end-to-end script and a backup script.

## How voting works (and what it does not guarantee)

One vote per browser per poll, best effort.

- When a browser loads a poll page, middleware sets an `httpOnly` cookie holding a random 256-bit secret plus an HMAC of it under a server-side key. A cookie a client makes up fails the HMAC check and is refused, so identity is always server-issued. The database stores only the secret's SHA-256 and enforces `UNIQUE (poll_id, voter_token)`.
- Voting goes through the `cast_vote` Postgres function, which only the Supabase `service_role` can execute. Browsers cannot call it, so they cannot choose their own identity. IP addresses and proxy headers are not used.
- The function also checks that the option belongs to the poll, and a trigger keeps `poll_options.votes` equal to the number of vote rows.

In production the cookie is named `__Host-poll_voter` (Secure, no Domain), so a sibling subdomain cannot plant a cookie in a visitor's browser.

Upgrade note: earlier unsigned `poll_voter` cookies are not accepted. Browsers get a new identity on their next poll page load, so people who already voted can vote once more after deploying this version.

This is not anti-fraud protection. Someone who clears cookies, uses a private window or another browser can vote again, and a script that fetches the poll page without cookies gets a fresh identity each time. People sharing one browser share one vote.

## Tech stack

Next.js 15.5 (App Router, Server Components, Server Actions), React 19, TypeScript 5, Tailwind CSS 4 with shadcn-style components (Radix UI), Supabase (Postgres, Auth, Row Level Security) through `@supabase/supabase-js` 2.57 and `@supabase/auth-helpers-nextjs` 0.10, `qrcode.react` 4 for the QR code, Vitest 2 and `pg` for tests.

## Setup

Requirements: Node.js 18.18 or newer (checked on Node 22), npm, and a Supabase project.

```bash
cd alx-polly
npm ci
```

The repository root is not an npm workspace; the app installs on its own.

### Environment variables

Create `alx-polly/.env.local` (see `.env.example`; never commit real values):

| Name | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app (browser and server) | Project URL. Inlined at build time. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app (browser and server) | Public anon key. Inlined at build time. |
| `SUPABASE_SERVICE_ROLE_KEY` | app (server only) | Required for voting and for the voted/not-voted check. Never prefix with `NEXT_PUBLIC_`. Without it, voting shows "Voting is not available right now". |
| `VOTER_COOKIE_SECRET` | app (server only) | Optional. Key used to sign voter cookies. Defaults to `SUPABASE_SERVICE_ROLE_KEY`. Changing the key you use (including rotating the service role key when no separate secret is set) invalidates every voter cookie, so everyone can vote once more. Set a separate `VOTER_COOKIE_SECRET` to avoid that coupling. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | app (browser) | Optional. Shows the Cloudflare Turnstile widget on voting and sign-up. See `docs/SECURITY.md`. |
| `TURNSTILE_SECRET_KEY` | app (server only) | Optional. Verifies Turnstile tokens on votes. Put the same secret in Supabase > Authentication > Bot and Abuse Protection for sign-up. |
| `NEXT_PUBLIC_SENTRY_DSN` | app (browser and server) | Optional. Enables Sentry. Unset means the Sentry SDK is left out of the build and nothing is sent. See `docs/OBSERVABILITY.md`. |
| `SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | app | Optional, default 0.1. |
| `NEXT_PUBLIC_VERCEL_ANALYTICS` | app (browser) | Optional. Set to `1` after enabling Web Analytics in Vercel to load its script. See `docs/OBSERVABILITY.md`. |
| `NEXT_PUBLIC_SITE_URL` | app | Optional. Canonical site URL for link previews (falls back to the Vercel production URL). |
| `SUPABASE_DB_URL` | `npm run db:migrate` only | Direct Postgres connection string from the Supabase dashboard. Not needed at runtime. |
| `TEST_DATABASE_URL` | `npm run test:db` only | Admin connection to a throwaway Postgres. Never point it at a real project. |

### Database

Migrations are in `supabase/migrations/`, applied in filename order:

1. `20250905_create_schema.sql` tables, base RLS, indexes.
2. `20250906_create_polls_with_totals_view.sql` totals view for the poll list.
3. `20251005000000_browser_vote_identity_and_rls.sql` browser-level voting, stricter RLS, atomic poll creation, option ordering, count integrity.
4. `20251006000000_poll_options_insert_guard.sql` caps options at 20 and refuses new options once a poll has votes, even for direct API inserts (concurrency-safe: `cast_vote` now takes a shared lock on the poll row).
5. `20251007000000_robustness.sql` closing and login-only polls, results visibility, unlisted polls (polls are readable one at a time through `get_poll`), `replace_poll_options`, DB-backed rate limits, and account-deletion cascades. **Apply it before deploying the matching app version**: the new app calls functions that do not exist before it.

Apply them with:

```bash
SUPABASE_DB_URL='postgresql://...' npm run db:migrate -- --dry-run   # list pending
SUPABASE_DB_URL='postgresql://...' npm run db:migrate                # apply
```

Each file runs in its own transaction and is recorded in `public.app_migrations`, so re-running applies only new files. The runner connects straight to Postgres; it does not create any SQL-executing function behind the API. If you prefer, paste each file into the Supabase SQL editor in order; then `app_migrations` is not updated, so do not mix the two methods.

If your project already has data, migration 3 is forward-only and keeps every poll, option and vote row. What changes: the IP and per-user uniqueness constraints are dropped, the old `vote_for_option` function is removed, `poll_options.votes` is recomputed from the `votes` table, and a browser that voted before the upgrade can vote once more because its old vote has no browser token. Back up first.

Two earlier migration files were touched: the schema file had invalid SQL (`UNIQUE (...) NULLS NOT DISTINCT`, now `UNIQUE NULLS NOT DISTINCT (...)`) and the view migration was renamed from `20250903_` to `20250906_` so it sorts after the tables it needs (details in `supabase/README.md`). If you had applied them by hand or with the Supabase CLI, read that note before running the runner.

The migration runner has been run against a local PostgreSQL 17 (fresh install and upgrade-with-data cases, see Tests). It has not been run against any Supabase project from this repository.

### Supabase Auth settings

In the Supabase dashboard under Authentication > URL Configuration, set the Site URL and add your redirect URLs (for example `http://localhost:3000/**` and your Vercel URLs). If email confirmation is enabled, new users must confirm their address before signing in; the sign-up form says so.

### Run

```bash
npm run dev       # http://localhost:3000
npm run build && npm start
```

`npm run build` also copies this README to the repository root (`scripts/sync-readme.js`).

## Tests and checks

```bash
npm test            # unit tests (Vitest), no external services
npm run typecheck   # tsc --noEmit
npm run test:db     # real-Postgres tests of migrations, RLS and the vote function
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run build
```

`test:db` needs a disposable PostgreSQL 15+ server. It creates and drops its own databases and installs a small stand-in for Supabase's `auth` schema and roles (`tests/db/bootstrap.sql`). For example:

```bash
initdb -D /tmp/pgtest -A trust -U postgres
pg_ctl -D /tmp/pgtest -o "-p 54329 -c unix_socket_directories='' -c listen_addresses=127.0.0.1" start
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
```

The build needs the two `NEXT_PUBLIC_` variables set because pages that use Supabase are prerendered; any syntactically valid values let it compile. There is no ESLint configuration in this project, so there is no lint step.

`test:db` stands in for the eval lane: this app has no LLM component, so the measurable quality checks are the database rules (one vote per browser, option must belong to poll, owner-only writes, counts equal vote rows) run against real Postgres.

## Deploying to Vercel

1. Import the repository and set the project's Root Directory to `alx-polly`.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for the environments you use, before the first build (the `NEXT_PUBLIC_` values are baked in at build time; changing them needs a redeploy). Mark the service role key as sensitive.
3. Apply the migrations to your production Supabase project yourself, with `npm run db:migrate` from a trusted machine, before sending traffic.
4. Add the deployed URL to Supabase Auth redirect URLs.
5. `vercel.json` pins the Next.js framework, `npm ci` / `npm run build`, (security headers live in `next.config.ts`). After a deploy, run `node scripts/smoke.js https://<your-url> [pollId]` for read-only live checks.
6. If a deploy fails, open the failed deployment's build log. A build that stops with `[check-env] ERROR` is missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`; add them under Settings > Environment Variables and redeploy (they cannot be added after the fact to an existing build). `No Next.js version detected` means the Root Directory is not `alx-polly`.

## Documentation

| Topic | File |
| --- | --- |
| Poll settings, closing, locked options, CSV, live results | `docs/POLLS.md` |
| Sign-in, password reset, account deletion | `docs/AUTH.md` |
| Email delivery (custom SMTP, "Confirm email") | `docs/EMAIL.md` |
| Voting threat model, Turnstile, rate limits, CSP | `docs/SECURITY.md` |
| Error reporting and analytics | `docs/OBSERVABILITY.md` |
| Accessibility audit and theme | `docs/ACCESSIBILITY.md` |
| Design system: colors, type, components, motion | `docs/DESIGN.md` |
| Custom domain, backups, key rotation, release checklist | `docs/OPERATIONS.md` |

## Known limitations

- Browser-level voting is easy to evade (see above) and is not suitable where the result matters.
- Polls are unlisted, not secret: anyone who has a poll's link can open it, and `get_poll` returns it. They cannot be enumerated through the API.
- Deleting an account deletes the polls it owns (with their options and votes). Votes that account cast on other people's polls stay, without the account link.
- Polls created before the ownership rules that have no owner stay readable and votable but cannot be edited or deleted by anyone.
- The share link and QR code appear once the page has loaded in the browser (they need the page's own origin).
- A browser gets its voter cookie when it loads a poll page; voting without cookies enabled is refused, not counted. In production mode the cookie is `Secure`, so over plain `http://` on a non-localhost host (for example `next start` on a LAN IP) browsers drop it and voting is refused; use HTTPS or localhost.
- Results refresh by polling every 8 seconds while the tab is visible, not by realtime push.
- Saving the edit form runs three requests (options, text, settings). If one fails, the earlier ones stay saved and the page says so.
- Unknown or deleted poll URLs show a "Poll not found" page with HTTP 200 because the page streams; they are not indexed-friendly 404s.

## How AI tools were used in this build

This project was built with AI assistance across the lifecycle. Concrete examples from this repository:

| Stage | Tool | Example in this repo |
| --- | --- | --- |
| Planning and data model | AI chat (Claude) | Designed the `polls` / `poll_options` / `votes` schema, the one-vote-per-browser rule (`UNIQUE (poll_id, voter_token)`) and the owner-only Row Level Security policies in `supabase/migrations/`. |
| Code generation | Claude Code (Claude Sonnet 5.5) | Server Actions in `lib/actions.ts`, the signed voter cookie (`lib/voter-cookie.ts`, `middleware.ts`), the `cast_vote` and `create_poll_with_options` Postgres functions. |
| UI | shadcn/ui components, generated and adapted with AI | `components/ui/*`, `ShareCard` (link, copy, Web Share, QR via `qrcode.react`), `ResultsList`. |
| Testing | Claude Code writing Vitest suites | `lib/*.test.ts` (unit) and `tests/db/*` (real Postgres: migrations, RLS, vote function). Every bug fix ships a regression test. |
| Debugging | Claude Code | Found that the first schema had invalid SQL (`NULLS NOT DISTINCT` placement), that the view migration sorted before its tables, and that a build without env vars crashed prerendering (now a readable `check-env` error on Vercel). |
| Deployment | Claude Code driving the Vercel CLI | `vercel.json`, the pre-build env check, and the deploy checklist below. |

AI-written code was reviewed and run, not trusted: the tests and commands in this README are what back it. The commit history shows the sequence.

## Repository layout

- `app/` routes: `/` (landing), `/auth`, `/auth/forgot`, `/auth/reset`, `/account`, `/polls` (my polls), `/polls/new`, `/polls/[id]` (public), `/polls/[id]/edit`, `/polls/[id]/export`, `/api/health`
- `docs/` topic guides (see Documentation)
- `.github/workflows/` CI and manual live checks; `scripts/e2e/`, `scripts/smoke.js`, `scripts/backup.js`
- `components/` UI, including `ShareCard`, `VoteForm`, `ResultsList`
- `lib/` server actions (`actions.ts`), Supabase clients, validation, results math, voter identity
- `supabase/migrations/` SQL; `supabase/README.md` schema notes
- `scripts/apply-migrations.js` migration runner
- `tests/db/` real-Postgres suite; `lib/*.test.ts` unit tests
