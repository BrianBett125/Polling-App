'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { describeTotalChange, startLiveRefresh } from '@/lib/results-live';

/**
 * Keeps an open poll's results current: re-renders the page every 8 seconds while the tab is visible,
 * pauses while hidden, refreshes at once when the tab comes back, and does nothing once the poll is closed.
 * Screen readers hear a message only when the total moves, never on every tick.
 */
export function LiveRefresh({ enabled, total }: { enabled: boolean; total: number }) {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState('');
  const previousTotal = useRef<number | null>(null);

  useEffect(() => {
    return startLiveRefresh({
      enabled,
      env: {
        isVisible: () => document.visibilityState === 'visible',
        refresh: () => router.refresh(),
        onVisibilityChange: (onChange) => {
          document.addEventListener('visibilitychange', onChange);
          return () => document.removeEventListener('visibilitychange', onChange);
        },
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (handle) => window.clearInterval(handle as number),
      },
    });
  }, [enabled, router]);

  useEffect(() => {
    const message = describeTotalChange(previousTotal.current, total);
    previousTotal.current = total;
    if (message) setAnnouncement(message);
  }, [total]);

  return (
    <>
      {enabled && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="animate-ring inline-block size-2 rounded-full bg-success" />
          Updating live
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
}
