import { parseSampleRate, scrubEvent } from '@/lib/sentry-scrub';

// Browser SDK. NEXT_PUBLIC_SENTRY_DSN is a build-time constant (see next.config.ts: '' when unset).
// The condition below must test the env expression itself, not a variable holding it: the bundler can
// only remove the dynamic import (and with it the whole SDK chunk) when the test is a literal.
type SentryModule = typeof import('@sentry/nextjs');
let sentry: SentryModule | null = null;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import('@sentry/nextjs').then((Sentry) => {
    sentry = Sentry;
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      sendDefaultPii: false,
      tracesSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
      beforeSend: (event) => scrubEvent(event),
      beforeSendTransaction: (event) => scrubEvent(event),
    });
  });
}

export const onRouterTransitionStart: SentryModule['captureRouterTransitionStart'] = (...args) => {
  sentry?.captureRouterTransitionStart(...args);
};
