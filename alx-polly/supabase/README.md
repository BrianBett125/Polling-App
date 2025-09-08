# Supabase Database Schema for Polling App

This directory contains the database schema and migrations for the Polling App. The schema defines tables for polls, poll options, and votes, along with Row Level Security (RLS) policies and helper functions.

## Schema Overview

### Tables

1. **polls** - Stores poll information
   - `id`: UUID (primary key)
   - `title`: Text (required)
   - `description`: Text
   - `created_by`: UUID (references auth.users)
   - `created_at`: Timestamp
   - `updated_at`: Timestamp

2. **poll_options** - Stores options for each poll
   - `id`: UUID (primary key)
   - `poll_id`: UUID (references polls)
   - `text`: Text (required)
   - `votes`: Integer (default 0)
   - `created_at`: Timestamp
   - `updated_at`: Timestamp

3. **votes** - Tracks individual votes
   - `id`: UUID (primary key)
   - `poll_id`: UUID (references polls)
   - `option_id`: UUID (references poll_options)
   - `user_id`: UUID (references auth.users)
   - `ip_address`: Text
   - `created_at`: Timestamp
   - Constraints to ensure one vote per user/IP per poll

### Functions

1. **increment_vote** - Increments the vote count for a poll option
2. **vote_for_option** - Records a vote and increments the vote count

### Row Level Security (RLS) Policies

The schema includes RLS policies to control access to the tables:

- **polls**: Everyone can view polls, but only authenticated users can create, update, or delete their own polls
- **poll_options**: Everyone can view options, but only poll creators can modify them
- **votes**: Everyone can view votes, but users can only vote once per poll

## Setup Instructions (Supabase UI — Step by Step)

> These steps mirror the automated scripts but are helpful if you prefer the Supabase UI.

1. Open your Supabase project and go to SQL Editor.
2. Apply migrations in order (copy/paste and run):
   - `supabase/migrations/20250905_create_schema.sql`
   - `supabase/migrations/20250903_create_polls_with_totals_view.sql`
3. Verify tables and functions:
   - Table Editor → you should see `polls`, `poll_options`, `votes`.
   - Database → Functions → you should see `vote_for_option`.
4. Check RLS policies:
   - Table Editor → select a table → RLS → confirm policies exist.
5. Grant access (if needed):
   - Confirm `GRANT SELECT` on any views used in listing pages (e.g., `polls_with_totals`) for `anon` and `authenticated` roles.

## Example: Voting via RPC (from app)
```ts
const { data, error } = await supabase.rpc('vote_for_option', {
  p_option_id: optionId,
  p_poll_id: pollId,
  p_ip_address: ipAddress,
});
```

## Troubleshooting
- Ensure your environment variables are correct and loaded.
- Confirm RLS policies and grants allow the intended operations.
- Use the Supabase Logs and SQL Editor to inspect function errors.
- If automatic scripts fail, re-run them or apply SQL manually via the UI.