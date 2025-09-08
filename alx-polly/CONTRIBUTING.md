# Contributing Guide

Thanks for your interest in contributing! This project aims to be friendly for newcomers and efficient for experienced contributors.

## Getting Started
- Read the main README for setup instructions.
- Install dependencies and run the dev server:
  ```bash
  npm install
  npm run dev
  ```
- Apply the Supabase schema (see README for options).

## Development Guidelines
- Use Server Components for data fetching and Server Actions for mutations.
- Avoid client-side fetching for core flows.
- Keep components small and focused.
- Follow the existing file structure and naming conventions.
- Add or update tests when changing behavior.

## Branching & PRs
- Create feature branches off `main`.
- Keep PRs focused and under ~300 lines where possible.
- Reference related issues in your PR description: `Fixes #123`.
- Include a brief summary of changes and screenshots for UI changes.

## Commit Messages
- Use clear, conventional messages:
  - `feat: add poll QR code component`
  - `fix: revalidate poll listing after vote`
  - `docs: update README with setup`

## Code Style
- TypeScript strict mode where possible.
- Prefer async/await with try/catch in Server Actions.
- Use Tailwind + shadcn/ui components.
- No secrets or keys in the repo.

## Running Tests
```bash
npm test
```

## Reporting Issues
- Use the Issues tab: include steps to reproduce, expected vs actual, and screenshots/logs if possible.

## Roadmap & Ideas
- Check open issues labeled `enhancement` or `good first issue`.
- Propose ideas via a GitHub Discussion or an Issue.

We appreciate every contribution — thank you for helping improve the Polling App!