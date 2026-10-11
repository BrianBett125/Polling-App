# Accessibility

What the app does for keyboard and screen reader users, how it was audited, and what is still open.

## What is built in

- Skip link: the first Tab on any page focuses "Skip to main content" (hidden until focused), which jumps to `<main id="main">`.
- Landmarks: `<header>`, `<nav aria-label="Main">`, one `<main id="main">`. The dashboard adds `role="search"` for its search form and `<nav aria-label="Pagination">`.
- `<html lang="en">`.
- Focus: every interactive element shows a 2px ring (`:focus-visible` in `app/globals.css`, in `@layer base` so components that style their own ring still win).
- Theme: light, dark or system from the header toggle (`components/ThemeToggle.tsx`). The choice is stored in `localStorage` (guarded, so blocked storage only loses persistence). `<html>` always carries exactly one of `light` or `dark`. A static inline script in `<head>` (`THEME_INIT_SCRIPT` in `lib/theme.ts`) sets it before first paint, so there is no flash. With scripts blocked, `globals.css` still follows `prefers-color-scheme`. "System" tracks OS changes live. Tailwind's `dark:` variant follows the `.dark` class.
- Motion: `prefers-reduced-motion: reduce` cuts animations and transitions to near zero.
- Forms: every input has a visible `<label>`; the dashboard search works without JavaScript (plain GET form).
- Color tokens were adjusted to pass WCAG AA contrast: light `--destructive` is now `0 72% 46%` (was `0 84.2% 60.2%`, 3.6:1 against its white text, now 5.4:1) and light `--muted-foreground` is `240 3.8% 42%` (4.4:1 on the secondary surface before, now 5.1:1).

### Content Security Policy note

The theme script is inline. If a CSP without `'unsafe-inline'` for `script-src` is added, allow it by hash:

```
script-src 'self' 'sha256-nLR7s7ui6znhtUBLcsicVamn8YhY9B1oeebtqf4B2Qs=' ...
```

`lib/theme.test.ts` fails when this hash and the script drift apart, so update both together. Next.js itself also injects inline scripts, so a real CSP needs nonces or a Next-aware setup anyway.

## Audit method

- Tool: axe-core 4.x run inside Chrome (Playwright driving `/usr/bin/google-chrome`), against a production build (`next build` and `next start`).
- Rule sets: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice`.
- Themes: every page twice, once with OS and stored theme light, once dark (stored `theme=dark` and a dark OS), and the `<html>` class was read back to confirm the theme really applied.
- Data: the app was pointed at a small stand-in for the Supabase API (auth user, `get_poll`, the legacy poll select, and a 30-row `polls_with_totals` list) because no real Supabase project was used. Signed-in pages were reached with a session cookie accepted by that stand-in. This audits what the app renders, not Supabase itself.
- Baseline ("before") is the same audit on the base branch without this unit's changes.

### Pages audited

`/`, `/auth`, `/auth/forgot` (does not exist, returns the 404 page), `/polls/<id>` (as the owner, with the share card), `/polls/<unknown id>` (not found), `/no-such-page` (404), `/polls` (30 polls, 3 pages), `/polls?q=...` (matches), `/polls?q=zzz` (empty search), `/polls/new`, `/polls/<id>/edit`.

### Results (serious or critical violations, all pages, both themes)

| | Before | After |
| --- | --- | --- |
| Serious / critical | 1 rule on `/polls` (light only): `color-contrast`, destructive Delete button, 3.6:1 against 4.5:1 | 0 |
| Moderate (best-practice) | `heading-order` on `/polls`, `/polls/<id>`, `/polls/new`; `page-has-heading-one` on `/`, `/auth`, `/polls/<id>/edit` | `heading-order` on `/polls/<id>`, `/polls/new`; `page-has-heading-one` on `/`, `/auth`, `/polls/<id>/edit` |

Fixed in this unit: the contrast failure (tokens), the `/polls` heading order (cards use `h2` under the page `h1`), and the share card heading (`h2`).

### Open items in files this unit does not own

These are moderate best-practice findings, not WCAG A/AA failures, and each is a small change:

| Finding | Where | Suggested fix |
| --- | --- | --- |
| `heading-order`: card titles render as `h3` directly under the page `h1` | `components/ui/card.tsx` (`CardTitle`), used by `app/polls/new/page.tsx:70` and `app/polls/[id]/page.tsx:68,78` | Render `CardTitle` as `h2` |
| `page-has-heading-one`: no `h1` | `app/page.tsx` (home), `app/auth/page.tsx:58` (`CardTitle`), `app/polls/[id]/edit/page.tsx:41` (`CardTitle`) | Give each page an `h1` |

## What was not verified

- No screen reader (NVDA, VoiceOver, JAWS) pass. axe finds about a third of real issues; the keyboard checks below are scripted, not a human walkthrough.
- No forced-colors or 200% zoom pass.
- Vote and results screens in every state (hidden results, closed poll) were audited only in the states the stand-in served.
- Pages behind real Supabase data (long titles, many options) may expose layout issues this audit could not.

## Scripted behavior checks (all passed)

Skip link takes first focus, is visible, and moves focus to `#main`; one `main` and a labelled `nav`; theme toggle sets the class and persists, system follows OS changes live, explicit light beats a dark OS, class is present during parse (no flash), blocked `localStorage` still themes from the OS and the toggle still works.

## Re-running the audit

The unit tests (`npm test`) cover the pure logic. The browser audit is a scratch script, not part of the repo: load axe-core into each page with Playwright and run `axe.run` with the rule tags above, in both themes.

## Redesign audit (axe-core)

After the visual redesign, axe-core was run on every screen in light and dark at 1280px and 390px wide: home, sign in, forgot password, poll (unvoted, option selected, voted), closed poll, login-only poll, not found, dashboard, create, owner view, edit and account (13 screens x 2 themes x 2 widths).

- First pass: 1 serious finding, the Delete button text on the dark dashboard (4.33:1 against the 4.5:1 minimum). Fixed with a lighter red for text in dark mode and a darker solid destructive color.
- Final pass: 0 violations of any impact on every screen.
- `lib/design-tokens.test.ts` keeps the token pairs above WCAG minimums on every commit, and `scripts/e2e` fails on any console CSP violation or page error.

Not covered: screen reader testing, forced-colors mode, and zoom to 400 percent.
