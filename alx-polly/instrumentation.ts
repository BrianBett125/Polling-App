import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return; // no DSN: load nothing
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Reports errors thrown in Server Components, route handlers and Server Actions.
// A no-op when Sentry was never initialised.
export const onRequestError = Sentry.captureRequestError;
