import { parseSampleRate, scrubEvent } from '@/lib/sentry-scrub';

// Browser SDK. NEXT_PUBLIC_SENTRY_DSN is inlined at build time. Unset means this whole branch is
// removed from the bundle: no SDK code is shipped and no request is ever made to Sentry.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryModule = typeof import('@sentry/nextjs');
let sentry: SentryModule | null = null;

if (dsn) {
  import('@sentry/nextjs').then((Sentry) => {
    sentry = Sentry;
    Sentry.init({
      dsn,
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
