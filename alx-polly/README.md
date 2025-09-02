# Polling App with QR Code Sharing

This is a [Next.js](https://nextjs.org) application that allows users to create polls, share them via unique links and QR codes, and collect votes.

## Getting Started

### Prerequisites

- Node.js 18.x or later
- Supabase account and project

### Environment Setup

1. Clone the repository
2. Create a `.env.local` file in the root directory with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Database Setup

The application requires specific tables in your Supabase database. You can set them up in two ways:

#### Option 1: Using the Migration Script

Run the migration script to automatically create all required tables and security policies:

```bash
node scripts/apply-migrations.js
```

#### Option 2: Manual Setup in Supabase Dashboard

You can manually run the SQL scripts located in the `supabase/migrations` directory in the Supabase SQL editor.

### Running the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database Schema

The application uses the following tables in Supabase:

### polls
- `id`: UUID (Primary Key)
- `title`: TEXT (Required)
- `description`: TEXT
- `created_by`: UUID (References auth.users)
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### poll_options
- `id`: UUID (Primary Key)
- `poll_id`: UUID (References polls)
- `text`: TEXT (Required)
- `votes`: INTEGER
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### votes
- `id`: UUID (Primary Key)
- `poll_id`: UUID (References polls)
- `option_id`: UUID (References poll_options)
- `user_id`: UUID (References auth.users)
- `ip_address`: TEXT
- `created_at`: TIMESTAMP

## Features

- User authentication with Supabase Auth
- Create polls with multiple options
- Vote on polls (authenticated or anonymous)
- View poll results
- Share polls via unique links
- QR code generation for easy sharing

## Technologies Used

- Next.js (App Router)
- TypeScript
- Supabase (Database & Auth)
- Tailwind CSS with shadcn/ui components
