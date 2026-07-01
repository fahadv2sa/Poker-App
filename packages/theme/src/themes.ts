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
