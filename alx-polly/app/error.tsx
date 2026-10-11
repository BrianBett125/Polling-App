'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Error boundary for everything under the root layout. Shows a friendly message and a retry button;
 * never the message or stack of the error itself (those can leak internals). The digest is a
 * short server-side id the owner can search for in logs.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Without a DSN Sentry was never initialised and this is a no-op.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        We hit an unexpected problem loading this page. Try again, and if it keeps happening come back in a few minutes.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
    </div>
  );
}
