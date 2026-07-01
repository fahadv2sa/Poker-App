/**
 * @fb/theme — numbered theme registry + switch API.
 *
 * Requirement 1 (numbered): every theme IS a number. It applies via
 * `data-theme="N"` on <html> and is selected by number.
 * Requirement 2 (isolated): each theme's colours live entirely in its own
 * themes/theme-N.css under `[data-theme="N"]`; this registry only records the
 * number, a human label, and the theme's PWA chrome colour. Adding/removing a
 * theme = add/remove one file + one entry here — nothing else in the codebase.
 */

export interface ThemeDef {
  /** Stable theme number — the switch key (data-theme="id"). */
  id: number;
  /** Human label (dashboards / future theme picker). */
  name: string;
  /** PWA / browser chrome colour for this theme (manifest + status bar). */
  chrome: string;
}

/** All themes, by number. Theme 0 = "Gold on Black" (original); Theme 1 = "Daylight"
 *  (light) and is the current default. */
export const THEMES: readonly ThemeDef[] = [
  { id: 0, name: "Gold on Black", chrome: "#080b13" },
  { id: 1, name: "Daylight", chrome: "#f6f1e6" },
];

export const DEFAULT_THEME_ID = 1;

/** Cookie that carries the chosen theme number across requests (SSR reads it). */
export const THEME_COOKIE = "fb-theme";

/**
 * MASTER SWITCH — the single flag that activates runtime theme switching platform-wide.
 *
 * false (now): the mechanism is fully built but DORMANT. SSR always renders
 *   DEFAULT_THEME_ID and ignores the cookie, so players can neither see nor change the
 *   theme (even by editing the cookie). The API/hook/component below all exist and work,
 *   but nothing switches persistently.
 * true (later): SSR honours the `fb-theme` cookie (falling back to the default), so the
 *   dashboard — and, once you render <ThemeSwitcher>, end users — can switch by number.
 *
 * Wiring the dashboard or exposing to users = flip this ONE flag (and mount the switcher
 * where you want it). No other code changes. See packages/theme/README.md.
 */
export const THEME_SWITCHING_ENABLED = false;

export function isValidThemeId(id: unknown): id is number {
  return typeof id === "number" && THEMES.some((t) => t.id === id);
}

/**
 * The active theme number for a request/session. Pure + shared by SSR (layout) and the
 * client hook. While THEME_SWITCHING_ENABLED is false this ALWAYS returns the default
 * (the cookie is ignored) — the dormant, players-can't-change state.
 */
export function resolveThemeId(cookieValue?: string | number | null): number {
  if (!THEME_SWITCHING_ENABLED) return DEFAULT_THEME_ID;
  const n = typeof cookieValue === "string" ? Number(cookieValue) : cookieValue;
  return isValidThemeId(n) ? n : DEFAULT_THEME_ID;
}

export function getTheme(id: number): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

/** PWA/browser chrome colour for a theme (defaults to Theme 0). */
export function chromeFor(id: number = DEFAULT_THEME_ID): string {
  return getTheme(id).chrome;
}

/** Switch the whole platform to a theme by number (client-side). Persists the
 *  choice in a cookie so the SSR layout can restore it without a flash. */
export function setTheme(id: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = String(id);
  try {
    document.cookie = `fb-theme=${id};path=/;max-age=31536000;samesite=lax`;
  } catch {
    /* cookies unavailable — the attribute switch still applied for this session */
  }
}
