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

## Setup Instructions

### Prerequisites

1. A Supabase project
2. Environment variables set up in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

### Applying the Schema

Run the following command to apply the schema to your Supabase project:

```bash
npm run db:schema
```

If the automatic application fails, you can manually apply the schema:

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `migrations/20250905_create_schema.sql`
4. Execute the SQL

## Usage in the Application

The schema is designed to work with the Next.js application using the Supabase client. The main operations are:

- **Creating polls**: Insert into the `polls` table and then insert options into the `poll_options` table
- **Voting**: Call the `vote_for_option` function to record a vote
- **Viewing polls**: Select from the `polls` and `poll_options` tables

Example of voting for an option:

```typescript
const { data, error } = await supabase.rpc('vote_for_option', {
  p_option_id: optionId,
  p_poll_id: pollId,
  p_ip_address: ipAddress
});
```

## Troubleshooting

If you encounter issues with the schema:

1. Check that your Supabase URL and keys are correct
2. Ensure you have the necessary permissions to create tables and functions
3. Look for error messages in the console output
4. Try applying the schema manually through the Supabase dashboard