# @fb/theme — the platform theme (single source of truth)

Every colour on Football B (platform + Link Up + Top Ten) comes from **this package**.
No other file may hardcode a colour (enforced by `pnpm lint`: ESLint for `.ts/.tsx`,
`scripts/check-theme-colors.mjs` for `.css`). Exempt: this package, the temporary
`apps/web/src/app/preview/theme` harness, and `apps/web/src/lib/email.ts` (email clients
need literal hex).

## Structure

```
src/
  core.css            theme-AGNOSTIC wiring: Tailwind @theme map + every utility class
                      (lu-*, panel, felt, tiles, home, table surfaces). References tokens
                      only — never a literal colour.
  themes/
    theme-0.css        THEME 0 "Gold on Black" — self-contained under :root,[data-theme="0"]
    theme-1.css        THEME 1 "Daylight" (light) — self-contained under [data-theme="1"]  ← default
  index.css           barrel (core + all themes)  [apps import the leaf files directly]
  themes.ts           numbered registry + switch API
```

## Token layers

1. **Primitives `--c-*`** — raw `R G B` channels (e.g. `--c-danger: 217 105 79`). Any
   opacity: `rgb(var(--c-danger) / 0.4)`.
2. **Semantics `--fb-*`** — the app-facing API (`--fb-bg`, `--fb-surface`, `--fb-text`,
   `--fb-gold`, `--fb-danger`, …). **Use these** (or `bg-fb-*` / `text-fb-*` Tailwind
   utilities). `--lu-*` and the legacy shadcn tokens are kept as aliases.

Each theme file is **fully isolated**: it defines the COMPLETE `--c-*` + `--fb-*` set for
its number. Editing one theme never touches another.

## Themes are NUMBERED (Requirement 1)

A theme *is* a number, applied via `<html data-theme="N">` and selected by number.

| # | name | default |
|---|------|---------|
| 0 | Gold on Black | |
| 1 | Daylight (light) | ✔ |

## Add / remove a theme (Requirement 2)

- **Add:** create `themes/theme-N.css` (copy the shape of `theme-1.css`, all tokens under
  `[data-theme="N"]`), add `@import "./themes/theme-N.css";` in `index.css` **and** in
  `apps/web/src/app/globals.css`, and add one line to `THEMES` in `themes.ts`.
- **Remove (e.g. a seasonal theme):** delete the file + those three lines. Nothing else
  references it.

## Runtime switching (Phase 3) — built, currently DORMANT

The mechanism is complete but **hidden from players**. The master switch:

```ts
// packages/theme/src/themes.ts
export const THEME_SWITCHING_ENABLED = false;
```

- **false (now):** SSR always renders `DEFAULT_THEME_ID` and **ignores the cookie**, so
  players can neither see nor change the theme.
- **true:** SSR honours the `fb-theme` cookie (fallback = default) → switching is live.

### Wire the dashboard (by number)

```tsx
import { useTheme } from "@/components/theme/theme-switcher";
const { themeId, themes, setTheme } = useTheme();
setTheme(1); // switch by number (live + cookie)
```
or, server-side:
```ts
import { setThemeCookie } from "@/app/actions/theme";
await setThemeCookie(1);
```
A ready-made `<ThemeSwitcher />` control also exists (renders nothing while dormant).

### Expose to end users

Flip `THEME_SWITCHING_ENABLED` to `true` and render `<ThemeSwitcher />` in the user
layout. **No other code changes.**

## Proof / regression gate

`apps/web/e2e/theme-visual.spec.ts` + `/preview/theme` capture the **computed** colour of
every token + utility per theme and assert 0-diff (anti-aliasing-immune). Theme 0 must
always match its Phase-1 baseline (kept theme unchanged); each new theme gets its own.
