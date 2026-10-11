# Design system

The look of ALX Polly lives in a few places. Change these, not individual pages.

| What | Where |
| --- | --- |
| Colors, gradient, shadows, motion | `app/globals.css` |
| Fonts | `app/layout.tsx` (Bricolage Grotesque for headings and the wordmark, Geist for text) |
| Buttons, cards, inputs | `components/ui/*` |
| Brand mark and wordmark | `components/Logo.tsx` |
| Auth screens (brand panel beside the form) | `app/auth/layout.tsx` |
| Landing page | `app/page.tsx` |

## Colors

Tokens are HSL channels (`--primary: 254 78% 52%`) so Tailwind can add opacity (`bg-primary/10`).
There is a light set in `:root` and a dark set in `.dark`; a copy of the dark set sits in a
`prefers-color-scheme` block as the no-JavaScript fallback. Keep the two dark blocks identical
(`lib/design-tokens.test.ts` fails if they drift).

- **Brand gradient** `--brand-1/2/3` (indigo to violet to fuchsia). Use the `bg-brand` utility for
  primary buttons, the logo, charts and hero panels, and `text-brand` for one or two large words.
  White text on every stop passes 4.5:1.
- **Status colors** `success`, `warning` (each with a `-soft` background) and `destructive`.
  Use `bg-success-soft text-success` for an "open" chip, `bg-warning-soft text-warning` for "closed".
- Prefer semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`) over raw colors, so both
  themes keep working. When you must use a raw palette color, add its `dark:` pair.

## Shape and depth

Cards and tiles use `rounded-2xl`, buttons and inputs `rounded-xl`, chips `rounded-full`.
Shadows are the `shadow-soft`, `shadow-lift` and `shadow-glow` utilities (tinted with the brand hue,
not gray). `glass` is the frosted sticky header.

These helpers are declared with `@utility`, not in a plain CSS layer, on purpose: only `@utility`
classes work with variants such as `hover:shadow-glow` and `peer-checked:bg-brand`. A class in a plain
layer silently ignores the variant.

## Motion

Entrance and feedback animations are CSS only: `animate-fade-up`, `animate-bar` (result bars grow from
zero), `animate-pop` (check marks), `animate-float`, and the confetti in `components/VoteThanks.tsx`.
Stagger with `style={{ '--delay': '0.1s' }}`. A reduced-motion rule at the end of `globals.css`
switches all of it off for people who ask for that in their system settings.

## Patterns worth reusing

- **Option tile** (`VoteForm`): the radio input is invisible but stretched over the whole tile
  (`absolute inset-0 opacity-0`), so the entire tile is the tap target and keyboard focus still shows a
  ring on the tile. Do not use `sr-only` for it: the badge and check mark then sit on top of the input
  and swallow clicks.
- **Decorative elements** (letter badges, check circles, icons) are `aria-hidden`, so a radio's
  accessible name is exactly the option text.
- **Page title**: one `h1` per page, large display type, a one-line subtitle in `text-muted-foreground`.
  `CardTitle` is an `h2` by default; pass `as="h1"` only when the card title is the page title.

## Checks

- `lib/design-tokens.test.ts` computes WCAG contrast for the pairs the UI uses, in both themes.
- axe-core over every screen, both themes, both widths (see `docs/ACCESSIBILITY.md`).
- `scripts/e2e` drives the real flows and fails on any console CSP violation or page error.
