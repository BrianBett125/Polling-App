import * as Sentry from '@sentry/nextjs';
import { parseSampleRate, scrubEvent } from '@/lib/sentry-scrub';

// Browser SDK. NEXT_PUBLIC_SENTRY_DSN is inlined at build time; unset means nothing is initialised
// and no request is ever made to Sentry.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
