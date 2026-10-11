'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { parseThemeChoice, resolveTheme, THEME_STORAGE_KEY, type ThemeChoice } from '@/lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

function apply(choice: ThemeChoice) {
  let systemDark = false;
  try {
    systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // keep light
  }
  const theme = resolveTheme(choice, systemDark);
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

/** Light / dark / system switch. The choice persists in localStorage; "system" tracks the OS live. */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    try {
      setChoice(parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      // storage blocked: stay on system
    }
  }, []);

  useEffect(() => {
    if (choice !== 'system') return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const select = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice still applies for this page view
    }
    apply(next);
  }, []);

  const order: ThemeChoice[] = ['light', 'dark', 'system'];
  const current = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[2];
  const next = order[(order.indexOf(choice) + 1) % order.length];

  return (
    <>
      {/* Phones: a single button that cycles light, dark, system. */}
      <button
        type="button"
        onClick={() => select(next)}
        aria-label={`Color theme: ${current.label}. Switch to ${next}.`}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border/70 bg-card/70 text-foreground shadow-sm transition-colors hover:bg-accent sm:hidden"
      >
        <current.Icon className="size-4" aria-hidden="true" />
      </button>
      <div role="group" aria-label="Color theme" className="hidden rounded-full border border-border/70 bg-card/70 p-0.5 shadow-sm sm:inline-flex">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            aria-pressed={choice === value}
            aria-label={label}
            title={label}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:shadow-sm"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
      </div>
    </>
  );
}
