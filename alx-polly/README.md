# ALX Polly: polls with link and QR sharing

Signed-in users create polls and manage their own. Anyone with a poll's link can open it, vote, and see results as vote counts and percentages. Each poll page shows a copyable link and a QR code for the same URL.

## Features

- Email and password registration, login and logout (Supabase Auth).
- Create, edit (title and description) and delete your own polls. `/polls` lists the polls you own. Options and votes cannot be edited after creation.
- Every poll lives at its own URL, `/polls/<uuid>`. The page is public: no sign-in needed to view or vote.
- Share panel on each poll page: read-only link, "Copy link" button, "Share…" button where the browser supports the Web Share API, and a QR code. The URL is built in the browser from the origin the page was loaded from, so it is right on localhost, preview and production without any configured domain.
- Results with per-option counts and whole-number percentages that add up to 100. A poll with no votes shows 0% and an empty-state message.
- Friendly states for unknown or deleted polls, failed database calls, duplicate votes, loading, and empty lists. Database error text is logged on the server, never shown to visitors.

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
| `SUPABASE_DB_URL` | `npm run db:migrate` only | Direct Postgres connection string from the Supabase dashboard. Not needed at runtime. |
| `TEST_DATABASE_URL` | `npm run test:db` only | Admin connection to a throwaway Postgres. Never point it at a real project. |

### Database

Migrations are in `supabase/migrations/`, applied in filename order:

1. `20250905_create_schema.sql` tables, base RLS, indexes.
2. `20250906_create_polls_with_totals_view.sql` totals view for the poll list.
3. `20251005000000_browser_vote_identity_and_rls.sql` browser-level voting, stricter RLS, atomic poll creation, option ordering, count integrity.
4. `20251006000000_poll_options_insert_guard.sql` caps options at 20 and refuses new options once a poll has votes, even for direct API inserts (concurrency-safe: `cast_vote` now takes a shared lock on the poll row).

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

## Deploying to Vercel (preparation only, nothing has been deployed)

1. Import the repository and set the project's Root Directory to `alx-polly`.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for the environments you use, before the first build (the `NEXT_PUBLIC_` values are baked in at build time; changing them needs a redeploy). Mark the service role key as sensitive.
3. Apply the migrations to your production Supabase project yourself, with `npm run db:migrate` from a trusted machine, before sending traffic.
4. Add the deployed URL to Supabase Auth redirect URLs.
5. Default Vercel framework settings (Next.js) apply: install `npm ci`, build `npm run build`.

## Known limitations

- Browser-level voting is easy to evade (see above) and is not suitable where the result matters.
- Poll rows are readable by anyone holding the public anon key (Row Level Security allows `select`), because the link is the only gate. Treat poll links as unlisted, not secret.
- Deleting a Supabase auth user who owns polls or has votes fails with a foreign-key error (no `ON DELETE` rule on `created_by` / `user_id`). Delete or reassign their polls first.
- Polls created before the ownership rules that have no owner stay readable and votable but cannot be edited or deleted by anyone.
- The share link and QR code appear once the page has loaded in the browser (they need the page's own origin).
- A browser gets its voter cookie when it loads a poll page; voting without cookies enabled is refused, not counted. In production mode the cookie is `Secure`, so over plain `http://` on a non-localhost host (for example `next start` on a LAN IP) browsers drop it and voting is refused; use HTTPS or localhost.
- Results update when the page loads or after you vote; there is no realtime push.
- Unknown or deleted poll URLs show a "Poll not found" page with HTTP 200 because the page streams; they are not indexed-friendly 404s.
- Verified locally only. Nothing here has been run against a live Supabase project or Vercel.

## AI assistance

The voting, security and sharing changes in this revision were written with Claude Code (Claude Sonnet 5.5) in a single working session and checked with the tests and commands listed above. Nothing about earlier history of this repository is claimed here.

## Repository layout

- `app/` routes: `/auth`, `/polls` (my polls), `/polls/new`, `/polls/[id]` (public), `/polls/[id]/edit`
- `components/` UI, including `ShareCard`, `VoteForm`, `ResultsList`
- `lib/` server actions (`actions.ts`), Supabase clients, validation, results math, voter identity
- `supabase/migrations/` SQL; `supabase/README.md` schema notes
- `scripts/apply-migrations.js` migration runner
- `tests/db/` real-Postgres suite; `lib/*.test.ts` unit tests
