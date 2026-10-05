# Supabase schema

Migrations in `migrations/` run in filename order (see the root app README for how to apply them). Tables are in `public`.

## Tables

- **polls**: `id`, `title` (1 to 200 chars), `description` (up to 2000), `created_by` (references `auth.users`), `created_at`, `updated_at` (maintained by trigger).
- **poll_options**: `id`, `poll_id`, `text` (1 to 200 chars), `position` (display order), `votes` (cached count, maintained by trigger from `votes`), timestamps. `UNIQUE (poll_id, id)` so votes can reference a poll and option together.
- **votes**: `id`, `poll_id`, `option_id`, `voter_token`, `user_id` (optional, set by the server from the verified session), `ip_address` (legacy, no longer written), `created_at`.
  - `UNIQUE (poll_id, voter_token)`: one vote per browser per poll.
  - `voter_token` is the hex SHA-256 of the browser's cookie secret (`^[0-9a-f]{64}$`). Legacy rows have NULL.
  - Foreign key `(poll_id, option_id) -> poll_options (poll_id, id)`: an option must belong to the poll it is voted on.
- **polls_with_totals** (view): poll list with `total_votes`.
- **app_migrations**: bookkeeping written by `scripts/apply-migrations.js`. RLS on, no policies.

## Functions

- `cast_vote(p_poll_id, p_option_id, p_voter_token, p_user_id)`: records one vote. `SECURITY DEFINER`, executable only by `service_role`. Raises `VT001` invalid token, `VT002` already voted, `VT003` poll not found, `VT004` option not in poll. `lib/vote-errors.ts` maps these to user messages.
- `create_poll_with_options(p_title, p_description, p_options)`: creates a poll and its options in one transaction as the calling user (`SECURITY INVOKER`, RLS applies). Executable by `authenticated`. Raises `VT005` not signed in, `VT006` bad title, `VT007` bad options (2 to 20, each up to 200 chars).
- `sync_option_vote_count()` (trigger), `touch_updated_at()` (trigger).

## Row Level Security

| Table | anon | authenticated |
| --- | --- | --- |
| polls | select | select; insert/update/delete only where `created_by = auth.uid()` |
| poll_options | select | select; insert only into own polls; no update (counts cannot be edited) |
| votes | no access | no access (written only by `cast_vote`, read only with the service role) |

## Notes

- `20250905_create_schema.sql` was corrected in place to valid syntax (`UNIQUE NULLS NOT DISTINCT (...)`) and re-runnable policies; its original unique constraints on IP and user are dropped by the later migration.
- `20250903_create_polls_with_totals_view.sql` was renamed to `20250906_...` because it sorted before the tables it reads from. Contents are unchanged and idempotent (`create or replace view`). If you track migrations with the Supabase CLI and had applied the old name, run `supabase migration repair --status reverted 20250903` and `--status applied 20250906`. `scripts/apply-migrations.js` tracks by file name, so on a project already set up by hand the first run re-applies the first two files (both safe to repeat) and then the new one.
- Rows in `polls` with `created_by IS NULL` (from before anonymous creation was closed) remain readable but have no owner.
