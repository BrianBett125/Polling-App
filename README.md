# Polling App with QR Code Sharing

Create polls, share them via unique links and QR codes, and collect votes in real time. Built with Next.js (App Router), Supabase, Tailwind (shadcn/ui), and TypeScript.

## Table of Contents
- Overview & Purpose
- Features
- Requirements
- Installation
- Environment Variables
- Database Setup
- Running the App
- Getting Started (Example Usage)
- Testing
- Dependencies & Versions
- Docs, Migrations, Issues & Roadmap

## Overview & Purpose
This app lets anyone create a poll with multiple options, share it with a link or QR code, and gather votes. It uses Server Components for data fetching and Server Actions for mutations to keep the client light and fast.

## Features
- Create polls with multiple options
- Share polls via link and QR code
- Vote (supports authenticated and anonymous flows)
- View live results per option
- Secure by default using Supabase RLS

## Requirements
- Node.js 18+ (LTS recommended)
- A Supabase project (URL + anon key)
- npm, pnpm, or yarn

## Installation
```bash
# Clone and install
git clone <your-repo-url>
cd alx-polly
npm install
```

## Environment Variables
Create a `.env.local` in `alx-polly/` with:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```
Never commit secrets. These are loaded by Next.js at runtime.

## Database Setup
You can apply the database schema/migrations in two ways:

- Automatic (recommended):
```bash
npm run db:migrate   # runs scripts/apply-migrations.js
```

- Manual:
Open your Supabase SQL Editor and run the SQL files in `supabase/migrations/`.

## Running the App
- Development:
```bash
npm run dev
# Open http://localhost:3000
```
- Production:
```bash
npm run build
npm start
```

## Getting Started (Example Usage)
1) Sign up / Sign in (top-right).  
2) Create a poll at `/polls/new`. After creation you are redirected to `/polls/{id}`.  
3) Share the link or QR code with voters.  
4) Vote on an option. The page revalidates and shows updated counts immediately.  

Example: voting via a Server Action (simplified)
```ts
// Server Action (called from the poll page)
import { voteForOption } from '@/lib/actions';

export async function vote(formData: FormData, pollId: string) {
  'use server';
  const optionId = formData.get('option') as string;
  if (!optionId) return;
  await voteForOption(optionId, pollId);
}
```

## Testing
This project uses Vitest. To run the test suite:
```bash
npm test
```
Tests live under `lib/*.test.ts`.

## Dependencies & Versions
- next: 15.5.2
- react / react-dom: 19.1.0
- typescript: ^5
- tailwindcss: ^4 (with shadcn/ui)
- @supabase/supabase-js: ^2.57.0
- @supabase/auth-helpers-nextjs: ^0.10.0
- qrcode.react: ^4.2.0
- vitest: ^2.0.5

## Docs, Migrations, Issues & Roadmap
- App architecture and schema: see `supabase/README.md` and `supabase/migrations/`
- DB/app scripts: see `scripts/` (migrations, schema helpers)
- Issues/Roadmap: use your repository’s Issues tab to track bugs and features

Contributions are welcome! If you’re new, start by filing an Issue or picking up a good first issue. Keep PRs focused and small, and add tests where possible.
