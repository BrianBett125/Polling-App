# Observability

What the app reports, where it goes, and how to switch it on or off.

## Summary

| Signal | Tool | Default | Switch |
| --- | --- | --- | --- |
| Errors (server, edge, browser) | Sentry (`@sentry/nextjs` 10.76.2) | Off | Set `NEXT_PUBLIC_SENTRY_DSN` |
| Page views, web vitals | Vercel Web Analytics (`@vercel/analytics`) | On when deployed on Vercel and Web Analytics is enabled for the project | Enable or disable in the Vercel dashboard |
| Uptime | `GET /api/health` | Always on | Point an uptime monitor at it |

## Sentry

Inert by default. With no `NEXT_PUBLIC_SENTRY_DSN`, `Sentry.init` is never called in any runtime
(`instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`),
so no client exists, nothing is captured and no request goes to Sentry. The build does not need
`SENTRY_AUTH_TOKEN` and `next.config.ts` is not wrapped with `withSentryConfig`.

### Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | To enable | The project DSN. Public by design (it is sent to browsers). Set it for the environments that should report. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Server and edge trace sample rate, 0 to 1. Default `0.1`. Invalid values fall back to `0.1`. |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | No | Same for the browser. Default `0.1`. |

The environment tag is `VERCEL_ENV` (production, preview, development) on the server and `NODE_ENV` in the browser.

### What is captured

- Unhandled errors in Server Components, route handlers and Server Actions (`onRequestError` in `instrumentation.ts`).
- Errors caught by the React error boundaries `app/error.tsx` and `app/global-error.tsx`, and unhandled browser errors and promise rejections.
- Performance traces for 10% of requests and navigations by default.

### What is not captured

- `sendDefaultPii` is `false`: no IP address or user identity is attached by the SDK.
- Every event passes through `scrubEvent` (`lib/sentry-scrub.ts`, unit tested) in `beforeSend`, which removes
  request cookies, request bodies, headers whose names contain cookie, authorization, token, secret, session or api key,
  user email, username and IP, and redacts `code`, `token`, `access_token`, `refresh_token`, `password`, `state`
  and similar query parameters in request and breadcrumb URLs.
- Error boundaries show visitors a friendly message and a short reference (the Next.js error digest). Messages and stack traces are never rendered.
- Error events and performance transactions (`beforeSendTransaction`) both go through the scrubber. Do not put secrets in URLs anyway.

### Follow-up, optional: readable stack traces

Sentry shows minified browser frames until source maps are uploaded. That needs `withSentryConfig` in `next.config.ts`
plus `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` at build time. It is deliberately not set up: the app
builds and deploys without any Sentry credentials, and enabling upload is a one-file change when the team wants it.

### Verify it end to end

1. Set `NEXT_PUBLIC_SENTRY_DSN` in the target environment and redeploy (it is inlined at build time for the browser).
2. Trigger an error, for example a temporary `throw new Error('sentry test')` in a Server Component.
3. Confirm the event appears in Sentry, carries no cookie or Authorization header, and shows the environment tag.

## Vercel Analytics

`<Analytics />` is rendered in `app/layout.tsx`. Outside Vercel, or with Web Analytics disabled, it does nothing useful and
makes no calls that affect the app. It collects page views and referrers without cookies.

## Health check

`GET /api/health` returns `{"ok":true}` with `Cache-Control: no-store`. It does not touch the database, so it answers
"is the app serving", not "is Supabase up". Requests still pass through the middleware like every other route.
