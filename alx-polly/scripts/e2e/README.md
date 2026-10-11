# Live end-to-end check

A real browser walks the deployed app through its whole life cycle and cleans up after itself. It is separate from the app: its own `package.json`, its own lockfile, and `playwright-core` (no bundled browsers) is not a dependency of the app.

## What it does

1. Creates a pre-confirmed throwaway user (`e2e-throwaway-<tag>@example.com`) through the Supabase admin API.
2. Signs in through the UI.
3. Creates a poll with options Alpha and Beta.
4. Checks the QR code renders (visible, at least 100 px, has drawn modules) and that the share link field equals the poll URL. It does not decode the QR image.
5. Opens the poll as an anonymous visitor in a fresh browser context: checks the voter cookie is HttpOnly (and on https: Secure, `__Host-` prefix, path `/`), votes Alpha, sees 100% and "Your vote".
6. Reloads: the vote form is gone, the vote is still shown.
7. A second fresh context votes Beta: results show 50% / 50%; the first voter still sees "Your vote" on Alpha.
8. The owner edits the title.
9. The owner deletes the poll; the poll URL now answers HTTP 404 with "Poll not found" for the owner and for an anonymous visitor.
10. Always, in `finally`: deletes any polls left for the user, then the user, then checks both are gone. If that check fails the run exits 3 and prints the user id to clean up by hand.

Selectors use labels, roles and visible text (`Email`, `Password`, `Sign In`, `Create Poll`, `Submit vote`, `Save`, `Delete`, progress bar names such as `Alpha: 50% of votes`), not CSS classes.

## Run it

```bash
cd scripts/e2e
npm ci

export SITE_URL=https://polling-app-green.vercel.app
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...        # from your shell or a password manager, never a file in the repo
export CHROME_PATH=/usr/bin/google-chrome   # optional: common install paths are auto-detected

node run.js --dry     # checks the environment and prints the plan; no network, creates nothing
node run.js           # the real run
```

From `alx-polly/`: `npm run e2e:live` (after `npm ci` in `scripts/e2e`).

| Variable | Required | Meaning |
| --- | --- | --- |
| `SITE_URL` | yes | The deployed app to test |
| `SUPABASE_URL` | yes | The project that app uses (`NEXT_PUBLIC_SUPABASE_URL` is accepted too) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Creates and deletes the throwaway user and polls. Never printed |
| `CHROME_PATH` | no | Chrome or Chromium executable |
| `E2E_NO_SANDBOX` | no | Set to `1` when running as root in a container |
| `E2E_TIMEOUT_MS` | no | Per-wait timeout, default 20000 |

Exit codes: 0 all steps passed and cleanup verified, 1 a step failed (a screenshot goes to `scripts/e2e/artifacts/`, which is git-ignored), 2 bad environment, 3 steps passed but cleanup could not be verified.

## Safety notes

- The key can read and write every row of the project. Run this only from a machine you trust. Do not paste the key into a chat or a workflow log. The script redacts it from anything it prints.
- It runs against whatever `SITE_URL` and `SUPABASE_URL` you give it. Point it at production only deliberately: it adds one user, one poll and two votes for a few seconds, then deletes them.
- Screenshots on failure may show the throwaway poll only. They stay on disk; never upload them from a public repository's workflow.
- If the deployment has Cloudflare Turnstile enabled for voting or poll creation, the browser will be challenged and the run fails at that step. Use a Preview deployment configured with Cloudflare's always-pass test keys (see Cloudflare's Turnstile "testing" page for the current values), not production.

## GitHub Actions

`.github/workflows/live-checks.yml` (manual, `workflow_dispatch`) runs `scripts/smoke.js` and then this script against the `base_url` you give it. It needs two repository secrets, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Adding them is your decision: the repository is public, so only add them if you are comfortable with that key living in GitHub's secret store. Without them the e2e job fails at the environment check and the smoke job still works.

## Orphans

A crash before cleanup (power loss, killed process) can leave `e2e-throwaway-*@example.com` users and their polls. Remove them in the Supabase SQL editor:

```sql
DELETE FROM public.polls
  WHERE created_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-throwaway-%@example.com');
-- then delete the users under Authentication > Users, or with the admin API
```

## Status of this tool

The mechanics (sign in, create, vote in separate contexts, edit, delete, cleanup, failure screenshot) were exercised against a local stub that imitates the app's markup, not against the real deployment. The first run against the real app may need a selector adjusted. Pure helpers and `--dry` are covered by `lib/e2e-helpers.test.ts`.
