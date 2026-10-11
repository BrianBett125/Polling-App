/** Theme preference helpers shared by the toggle and the pre-paint script. No React, no DOM at import time. */

export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_STORAGE_KEY = 'theme';

export function parseThemeChoice(raw: unknown): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** The theme actually shown for a stored choice and the OS preference. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): 'light' | 'dark' {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme. Plain ES5, no
 * dependencies. Storage and matchMedia are guarded separately: a blocked localStorage still lets the
 * OS preference apply. Adds exactly one of the classes `dark` / `light` to <html>. If this script
 * is blocked entirely, globals.css still follows prefers-color-scheme.
 *
 * If a Content-Security-Policy without 'unsafe-inline' is ever added, allow this script by its
 * sha256 hash (base64 of the SHA-256 of this exact string, see docs/ACCESSIBILITY.md) or give it a nonce.
 */
export const THEME_INIT_SCRIPT = `(function(){var c='system',d=false;try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark')c=s}catch(e){}try{d=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}var t=c==='system'?(d?'dark':'light'):c;var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.style.colorScheme=t})();`;
