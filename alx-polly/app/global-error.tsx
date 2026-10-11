'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Last-resort boundary: renders when the root layout itself throws, so it replaces the whole
 * document and cannot rely on globals.css or any component. Inline styles only.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'Arial, Helvetica, sans-serif',
          background: '#ffffff',
          color: '#0a0a0b',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <main role="alert" style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#52525b' }}>
            The app hit an unexpected problem. Try again, and if it keeps happening come back in a few minutes.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#18181b',
              color: '#fafafa',
              border: 0,
              borderRadius: '0.375rem',
              padding: '0.6rem 1.2rem',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest && <p style={{ fontSize: '0.75rem', color: '#52525b' }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
