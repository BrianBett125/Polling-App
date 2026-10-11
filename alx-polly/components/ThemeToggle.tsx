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

  return (
    <div role="group" aria-label="Color theme" className="inline-flex rounded-md border border-input p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => select(value)}
          aria-pressed={choice === value}
          aria-label={label}
          title={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-foreground hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
