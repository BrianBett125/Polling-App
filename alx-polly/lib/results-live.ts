import { formatVotes } from './results';

/** How often an open poll page re-fetches its results while the tab is visible. */
export const LIVE_REFRESH_MS = 8000;

/** What the scheduler needs from the browser, so tests can drive it with fake timers. */
export type LiveEnv = {
  isVisible: () => boolean;
  /** Re-render the server component, e.g. `router.refresh()`. */
  refresh: () => void;
  /** Calls `onChange` whenever the tab shows or hides. Returns the unsubscribe function. */
  onVisibilityChange: (onChange: () => void) => () => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

/**
 * Polls on a timer only while the tab is visible:
 * - visible: ticks every `intervalMs`
 * - hidden: the timer is cleared, nothing runs in the background
 * - visible again: refreshes at once (data may be stale), then resumes the timer
 * - `enabled: false` (poll closed): never starts a timer, never subscribes
 * Returns a stop function that clears the timer and the listener. Calling it twice is safe.
 */
export function startLiveRefresh(opts: { env: LiveEnv; intervalMs?: number; enabled?: boolean }): () => void {
  const { env, intervalMs = LIVE_REFRESH_MS, enabled = true } = opts;
  if (!enabled) return () => {};

  let timer: unknown = null;
  let stopped = false;

  const startTimer = () => {
    if (timer === null) timer = env.setInterval(() => env.refresh(), intervalMs);
  };
  const stopTimer = () => {
    if (timer !== null) {
      env.clearInterval(timer);
      timer = null;
    }
  };

  const unsubscribe = env.onVisibilityChange(() => {
    if (stopped) return;
    if (env.isVisible()) {
      env.refresh();
      startTimer();
    } else {
      stopTimer();
    }
  });

  if (env.isVisible()) startTimer();

  return () => {
    if (stopped) return;
    stopped = true;
    stopTimer();
    unsubscribe();
  };
}

/**
 * Text for a screen-reader announcement, only when the total moved. `previous` is null on first render,
 * which must stay silent: the page already says the total.
 */
export function describeTotalChange(previous: number | null, next: number): string | null {
  if (previous === null || previous === next) return null;
  return `Results updated: ${formatVotes(next)} in total`;
}
