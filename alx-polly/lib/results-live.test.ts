import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeTotalChange, LIVE_REFRESH_MS, startLiveRefresh, type LiveEnv } from './results-live';

function makeEnv(initiallyVisible = true) {
  let visible = initiallyVisible;
  const listeners = new Set<() => void>();
  const handles = new Set<unknown>();
  const env: LiveEnv = {
    isVisible: () => visible,
    refresh: vi.fn(),
    onVisibilityChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setInterval: (fn, ms) => {
      const h = setInterval(fn, ms);
      handles.add(h);
      return h;
    },
    clearInterval: (h) => {
      handles.delete(h);
      clearInterval(h as ReturnType<typeof setInterval>);
    },
  };
  return {
    env,
    listeners,
    handles,
    setVisible(v: boolean) {
      visible = v;
      listeners.forEach((l) => l());
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startLiveRefresh', () => {
  it('refreshes every 8 seconds while visible, and not before', () => {
    const t = makeEnv();
    startLiveRefresh({ env: t.env });
    vi.advanceTimersByTime(LIVE_REFRESH_MS - 1);
    expect(t.env.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.env.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LIVE_REFRESH_MS * 3);
    expect(t.env.refresh).toHaveBeenCalledTimes(4);
  });

  it('is 8 seconds', () => {
    expect(LIVE_REFRESH_MS).toBe(8000);
  });

  it('pauses while hidden: no timer exists and nothing fires', () => {
    const t = makeEnv();
    startLiveRefresh({ env: t.env });
    t.setVisible(false);
    expect(t.handles.size).toBe(0);
    vi.advanceTimersByTime(LIVE_REFRESH_MS * 10);
    expect(t.env.refresh).not.toHaveBeenCalled();
  });

  it('does not start a timer when it begins hidden', () => {
    const t = makeEnv(false);
    startLiveRefresh({ env: t.env });
    expect(t.handles.size).toBe(0);
    vi.advanceTimersByTime(LIVE_REFRESH_MS * 2);
    expect(t.env.refresh).not.toHaveBeenCalled();
  });

  it('refreshes immediately when the tab becomes visible, then resumes the cadence', () => {
    const t = makeEnv();
    startLiveRefresh({ env: t.env });
    t.setVisible(false);
    vi.advanceTimersByTime(60_000);
    t.setVisible(true);
    expect(t.env.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LIVE_REFRESH_MS);
    expect(t.env.refresh).toHaveBeenCalledTimes(2);
  });

  it('never runs two timers, even on repeated visibility events', () => {
    const t = makeEnv();
    startLiveRefresh({ env: t.env });
    t.setVisible(true);
    t.setVisible(true);
    expect(t.handles.size).toBe(1);
    vi.advanceTimersByTime(LIVE_REFRESH_MS);
    // two immediate refreshes from the events, one tick from the single timer
    expect(t.env.refresh).toHaveBeenCalledTimes(3);
  });

  it('does nothing at all when disabled (closed poll)', () => {
    const t = makeEnv();
    const stop = startLiveRefresh({ env: t.env, enabled: false });
    expect(t.handles.size).toBe(0);
    expect(t.listeners.size).toBe(0);
    vi.advanceTimersByTime(LIVE_REFRESH_MS * 5);
    expect(t.env.refresh).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it('cleans up the timer and the listener on stop, and stop is idempotent', () => {
    const t = makeEnv();
    const stop = startLiveRefresh({ env: t.env });
    expect(t.listeners.size).toBe(1);
    stop();
    stop();
    expect(t.handles.size).toBe(0);
    expect(t.listeners.size).toBe(0);
    vi.advanceTimersByTime(LIVE_REFRESH_MS * 5);
    t.setVisible(true);
    expect(t.env.refresh).not.toHaveBeenCalled();
  });

  it('honours a custom interval', () => {
    const t = makeEnv();
    startLiveRefresh({ env: t.env, intervalMs: 1000 });
    vi.advanceTimersByTime(3000);
    expect(t.env.refresh).toHaveBeenCalledTimes(3);
  });
});

describe('describeTotalChange', () => {
  it('stays silent on first render and when nothing changed', () => {
    expect(describeTotalChange(null, 5)).toBeNull();
    expect(describeTotalChange(5, 5)).toBeNull();
  });
  it('announces the new total when it moves', () => {
    expect(describeTotalChange(4, 5)).toBe('Results updated: 5 votes in total');
    expect(describeTotalChange(0, 1)).toBe('Results updated: 1 vote in total');
  });
});
