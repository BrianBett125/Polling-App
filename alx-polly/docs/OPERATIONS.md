# Operations runbook

Everything the owner does after the code is merged: domain, backups, key rotation, releases, monitoring. Commands run from `alx-polly/` unless stated. The live app is https://polling-app-green.vercel.app.

Verification status of the external facts below (checked against the vendors' docs on 2026-10-11):

| Claim | Status |
| --- | --- |
| Vercel: Project > Settings > Domains > Add Domain; apex uses an A record, subdomains a CNAME | Verified in Vercel docs |
| Apex A value `76.76.21.21` | Documented by Vercel as the A record value or "your domain card's value". Use whatever the Domains page shows for your project |
| `www` CNAME `cname.vercel-dns.com` | Long-standing default, but Vercel docs now show a per-project value (for example `d1d4fc829fe7bc7c.vercel-dns-017.com`). Unverified as still accepted. Use the value on the Domains page |
| Supabase daily backups: Pro 7 days, Team 14, Enterprise 30; PITR is a paid add-on; free projects are not listed | Verified in Supabase docs |
| Supabase new secret keys can be created beside old ones and the old one deleted later | Verified in Supabase docs |

Nothing here has been run against the production project. Treat the first run of each procedure as a rehearsal.

## 1. Custom domain on Vercel

1. Vercel dashboard > your project > **Settings** > **Domains** > **Add Domain**. Enter the apex (`example.com`). Vercel offers to add `www.example.com` too; accept, and choose which one redirects to the other.
2. At your DNS provider (or registrar), create the records the Domains page shows:

   | Host | Type | Value |
   | --- | --- | --- |
   | `@` (apex) | A | `76.76.21.21` |
   | `www` | CNAME | `cname.vercel-dns.com` |

   Copy the exact values from the Domains page if they differ. Remove any old A, AAAA or CNAME record on the same host first; conflicting records are the usual cause of "Invalid Configuration".
3. Wait for the Domains page to show the domain as configured. Vercel issues the TLS certificate by itself. DNS can take minutes to hours.
4. Tell Supabase about the new origin: Dashboard > **Authentication** > **URL Configuration**.
   - **Site URL**: `https://example.com`
   - **Redirect URLs**: add `https://example.com/auth/callback` and `https://www.example.com/auth/callback`. Use exact paths in production, not `**`. Keep the `vercel.app` callback while both URLs are live.
5. Vercel > Settings > Environment Variables: if you have defined `NEXT_PUBLIC_SITE_URL` for your deployment, set it to `https://example.com` for Production. The app itself builds share links from the origin the browser is on (`components/ShareCard.tsx`) and the auth callback redirects relative to the request, so no code reads this variable today; setting it is harmless and keeps future code correct. A `NEXT_PUBLIC_*` change needs a redeploy (Deployments > the latest > Redeploy) because it is baked in at build time.
6. Voter cookies are host-bound (`__Host-poll_voter`, no Domain attribute). Visitors who voted on `polling-app-green.vercel.app` look like new voters on the new domain and can vote once more there. Redirect the old host to the new one (Domains page > the `vercel.app` entry is permanent; redirect the `www` or apex variant you do not use) and announce the new URL before you share it widely.
7. Re-run the checks against the new origin:

   ```bash
   npm run smoke -- https://example.com
   ```

   Then the browser flow (section 4). Sign in with a real account once by hand to confirm the auth redirect lands on the new domain.

Rollback: remove the domain from Vercel and restore the previous Site URL in Supabase. The `vercel.app` URL keeps working throughout.

## 2. Backups

### What protects you

| Layer | What it is | Limits |
| --- | --- | --- |
| Supabase plan backups | Daily physical backups of the whole database (Pro 7 days, Team 14, Enterprise 30). PITR add-on gives second-level restore points; enabling it stops daily backups | Free projects are not listed as having backups. A restore takes the project offline while it runs |
| `npm run backup` | A logical export of `polls`, `poll_options`, `votes` (and optionally user emails) to local JSON | A convenience copy, not a snapshot: tables are read one after another while the app runs. It cannot restore auth users, passwords or policies |

On the free plan the script is your only backup. Use both layers if you can.

### Running the script

Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment or in `.env.local`.

```bash
npm run backup -- --dry                 # prints the plan, reads and writes nothing
npm run backup                          # writes backups/<UTC timestamp>/
npm run backup -- --with-users          # also users.json (id, email, timestamps)
npm run backup -- --include-sensitive   # also votes.voter_token and votes.ip_address
npm run backup -- --out ~/safe/place    # a directory outside the repo, or an ignored one
```

Output per run: `polls.json`, `poll_options.json`, `votes.json`, optional `users.json`, and `manifest.json` with the row count, byte size and SHA-256 of every file. Verify a copy later with `sha256sum <file>` against the manifest.

Rules the script enforces: it pages 1000 rows at a time ordered by `id`; it refuses to write inside a git repository unless git ignores the path (`/backups/` is ignored); it refuses a non-empty output directory; it creates files readable only by you.

**The repository is public. Never run `backup.js` from a scheduled GitHub Action that uploads artifacts, and never commit a backup.** The files contain user data. Keep them on an encrypted disk or a private bucket.

### Retention advice

- Plan backups: use the plan's window; do not rely on it alone for anything older.
- Script copies: keep the last 7 daily and 4 weekly copies, delete older ones. Anything with `--with-users` or `--include-sensitive` is personal data: keep it for the shortest time that is useful and delete it when the account holder asks.
- Take a script backup before every migration that changes data and before any manual SQL on production.

### Restore

Restore into a scratch project first, never straight into production.

**A. From a Supabase plan backup or PITR**: Dashboard > **Database** > **Backups**, pick the point in time, confirm. The project is unavailable while it restores. Afterwards run `npm run smoke -- <url>` and the e2e flow.

**B. From the script's JSON files** (data only; the schema must already exist, so run the migrations first):

1. Create the target project or database and apply the schema: `SUPABASE_DB_URL=<direct connection string> npm run db:migrate`.
2. Users: votes and polls reference `auth.users`. Users must exist first. Recreate them (people sign up again, or an admin invites them) and map old ids to new ones, or restore into the same project where the users still exist. The script does not export passwords.
3. Load with `psql` (direct connection string from Dashboard > Connect), in this order. Replace the path with your backup directory:

   ```sql
   \set polls    `cat backups/20261011T120000Z/polls.json`
   \set options  `cat backups/20261011T120000Z/poll_options.json`
   \set votes    `cat backups/20261011T120000Z/votes.json`

   BEGIN;
   INSERT INTO public.polls
     SELECT * FROM jsonb_populate_recordset(NULL::public.polls, :'polls'::jsonb)
     ON CONFLICT (id) DO NOTHING;

   INSERT INTO public.poll_options
     SELECT * FROM jsonb_populate_recordset(NULL::public.poll_options, :'options'::jsonb)
     ON CONFLICT (id) DO NOTHING;
   -- A trigger maintains poll_options.votes from the votes table, so zero the cached
   -- counts before inserting votes or every vote is counted twice.
   UPDATE public.poll_options SET votes = 0
     WHERE id IN (SELECT (o->>'id')::uuid FROM jsonb_array_elements(:'options'::jsonb) o);

   INSERT INTO public.votes
     SELECT * FROM jsonb_populate_recordset(NULL::public.votes, :'votes'::jsonb)
     ON CONFLICT (id) DO NOTHING;
   COMMIT;
   ```

   `jsonb_populate_recordset` leaves columns missing from the JSON as NULL. Without `--include-sensitive` the restored votes have no `voter_token`, so counts are right but those browsers could vote again. If you need one-vote-per-browser to survive a restore, take backups with `--include-sensitive`.
4. The Supabase SQL editor works for small files if you paste the JSON in place of `:'polls'`, but the editor has a size limit; use `psql` for anything big.
5. Compare: `SELECT count(*) FROM public.polls;` (and the other tables) against `rows` in `manifest.json`. Spot-check the results page of two polls.

### Restore drill checklist (do it once now, then every quarter)

- [ ] Take a fresh `npm run backup` (add `--include-sensitive` if you want the full drill) and confirm `manifest.json` hashes match `sha256sum`.
- [ ] Create a scratch Supabase project (free plan is fine).
- [ ] `SUPABASE_DB_URL=<scratch> npm run db:migrate` succeeds.
- [ ] Load the three files with the SQL above; no errors.
- [ ] Row counts equal the manifest; `SELECT sum(votes) FROM public.poll_options` equals `SELECT count(*) FROM public.votes`.
- [ ] Open a restored poll in the app pointed at the scratch project and check results.
- [ ] Note the elapsed time and any step that was unclear; fix this document.
- [ ] Delete the scratch project and the local backup copy you no longer need.

## 3. Key rotation

Rotate on a schedule (yearly), on staff or contractor change, and immediately after any suspected leak. Always: new value first, switch consumers, verify, retire the old value last.

### Service role key (`SUPABASE_SERVICE_ROLE_KEY`)

Used server-side only, for votes and cleanup. **Gotcha: the voter cookie is signed with `VOTER_COOKIE_SECRET`, and when that is unset it falls back to the service role key.** Rotating the key then invalidates every voter cookie, and everybody can vote again. Do step 1 first.

1. Decouple the cookie signer. Vercel > Settings > Environment Variables: add `VOTER_COOKIE_SECRET` (Production, Preview) with the **current** service role key value, then redeploy and run the smoke check. Cookies stay valid because the signing value is unchanged. Skip if `VOTER_COOKIE_SECRET` is already set.
2. Supabase Dashboard > **Settings > API Keys**: create a new secret key (`sb_secret_...`). New keys sit beside the old ones; nothing breaks. If the project still uses the legacy `service_role` JWT, create the new secret key anyway and keep the legacy one active until step 5.
3. Vercel: edit `SUPABASE_SERVICE_ROLE_KEY` for Production (and Preview) to the new value. Redeploy (Deployments > latest > Redeploy; an env change does not apply to existing deployments).
4. Verify: `npm run smoke -- https://<site>`, then `npm run e2e:live` (it creates and deletes a poll and exercises voting with the new key). Also update your local `.env.local`, and any GitHub secret `SUPABASE_SERVICE_ROLE_KEY` if you added one for the live-checks workflow.
5. Retire the old key in the Dashboard. For a secret key this is permanent. For a legacy JWT, deactivating is reversible, so deactivate first and watch for errors for a day. Do not rotate the JWT secret itself unless the legacy anon key must also die: that invalidates every session and the anon key baked into the build, which means a redeploy and a forced re-login.
6. Leaked key: do steps 2 to 5 without the waiting, then review Auth and Database logs for the exposure window.

### Database password (used by `SUPABASE_DB_URL` for `npm run db:migrate`)

The running app does not use it, so there is no production downtime.

1. Dashboard > **Database** > **Settings** > reset the database password. Existing direct connections are dropped.
2. Update your local `.env.local` / password manager. Nothing in Vercel uses it unless you added `SUPABASE_DB_URL` there; if so, update it and redeploy.
3. Verify with `SUPABASE_DB_URL=<new> npm run db:migrate -- --dry-run` (lists pending migrations, changes nothing).

### Turnstile secret (CAPTCHA)

Cloudflare Dashboard > Turnstile > your widget. The site key (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) is public and unchanged by a secret rotation.

1. Roll the secret in Cloudflare. Cloudflare's rotate option can keep the old secret valid for a grace period (check the option's current wording in the dashboard; unverified here). If you cannot keep both, plan a short window in which verification fails.
2. Vercel: update `TURNSTILE_SECRET_KEY` (server only, read in `lib/captcha.ts`) for Production and Preview. Redeploy immediately after step 1 to shrink the window.
3. Verify by voting once from a fresh browser and creating a poll. If you cannot pass the widget, `lib/captcha.ts` shows how a failed verification is reported.
4. If the secret leaked rather than aged out, rotate first and accept the short failure window.

## 4. Release checklist

Order matters: **schema first, code second.** The new code may call database functions or columns that do not exist yet; old code keeps working against an additive schema.

1. CI is green on the PR (Actions: Typecheck/unit/build and Database rules). Review and merge the PR. Never push to `main`.
2. Does the PR add a file under `supabase/migrations/`? If yes:
   1. Take a data backup: `npm run backup`.
   2. Read the new SQL once. It must be additive and re-runnable (`IF NOT EXISTS`, `CREATE OR REPLACE`).
   3. Apply it **before** deploying, either
      - Supabase **SQL Editor**: paste the file and run it, or
      - from your machine: `SUPABASE_DB_URL=<direct connection string> npm run db:migrate -- --dry-run` to list what is pending, then without `--dry-run` to apply. Each file runs in its own transaction and is recorded in `public.app_migrations`, so re-running only applies new files. If you used the SQL Editor, that bookkeeping is not updated; either run `db:migrate` afterwards (the files are idempotent) or accept that the next `db:migrate` re-applies them harmlessly.
3. Deploy. Vercel builds `main` on merge. Watch Deployments until it is Ready. If `npm run build` fails on Vercel with a missing-variable message, add the variable and redeploy.
4. Smoke: `npm run smoke -- https://polling-app-green.vercel.app` (add `--json` for a machine-readable result). It must end with no FAIL. A SKIP on `/api/health` means that route is not deployed.
5. End-to-end: `npm run e2e:live`, or run the **Live checks** workflow (Actions > Live checks > Run workflow). Setup and what it covers are in `scripts/e2e/README.md`.
6. Look at Vercel's runtime logs for errors for ten minutes.
7. Rollback: Vercel > Deployments > the previous Ready deployment > **Promote to Production**. Migrations are not rolled back; that is why they must be additive.

## 5. Uptime monitoring

The robustness release adds `GET /api/health` (written by a separate unit; at the time this document was written the route was not yet in the tree, so read `app/api/health/route.ts` for what it actually checks and returns). `scripts/smoke.js` already calls it: HTTP 200 passes (a JSON body with `ok: false` or `status: "error"` fails), 404 is reported as SKIP because the route is not deployed, anything else fails.

Free monitor suggestion: UptimeRobot (free plan: 50 monitors, 5-minute interval, email alerts; plan limits unverified, check the current pricing page).

1. Create a monitor of type **HTTP(s)**, URL `https://polling-app-green.vercel.app/api/health` (or your custom domain), interval 5 minutes.
2. Expected: status 200 (optionally a keyword match on text the route's body contains).
3. Add your email as the alert contact. Add a second monitor for `/auth` (a full page render) so a broken front end is caught even if the health route is fine.
4. Do not poll `/api/health` more often than once a minute; a health check may query the database.
5. When it alerts: open Vercel > Logs, then Supabase > Logs. If Supabase is paused (free plan after a week of inactivity) restore the project from its dashboard.

The monitor only sees "up or down". The deep check is `npm run smoke` after each deploy and the weekly manual `npm run e2e:live`.
