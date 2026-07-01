"use client";

/**
 * Runtime theme switcher — the CLIENT hook + a ready-made control, switching by NUMBER.
 *
 * DORMANT BY DESIGN: nothing here is mounted in the player experience, and
 * THEME_SWITCHING_ENABLED (packages/theme) is false, so:
 *   - <ThemeSwitcher> renders nothing unless switching is enabled (safe to drop anywhere).
 *   - useTheme().setTheme(n) flips the live <html data-theme> immediately (great for an
 *     admin preview) and persists a cookie; SSR only honours that cookie once the master
 *     switch is on, so players can't change their theme today.
 *
 * TO WIRE THE DASHBOARD: import useTheme()/ThemeSwitcher (or the setThemeCookie server
 * action) and render/call it in the dashboard.
 * TO EXPOSE TO USERS: flip THEME_SWITCHING_ENABLED to true and render <ThemeSwitcher>
 * in the user layout. No other changes. See packages/theme/README.md.
 */

import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_THEME_ID,
  isValidThemeId,
  setTheme as applyTheme,
  THEME_SWITCHING_ENABLED,
  THEMES,
  type ThemeDef,
} from "@fb/theme/themes";

function currentThemeId(): number {
  if (typeof document === "undefined") return DEFAULT_THEME_ID;
  const n = Number(document.documentElement.dataset.theme);
  return isValidThemeId(n) ? n : DEFAULT_THEME_ID;
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export interface UseTheme {
  /** Active theme number. */
  themeId: number;
  /** Whether runtime switching is active platform-wide (the master switch). */
  enabled: boolean;
  /** All themes, by number. */
  themes: readonly ThemeDef[];
  /** Switch by number: flips <html data-theme> live + persists the cookie. */
  setTheme: (id: number) => void;
}

/** Read + switch the active theme by number. Safe on server (returns the default). */
export function useTheme(): UseTheme {
  const router = useRouter();
  const themeId = useSyncExternalStore(subscribe, currentThemeId, () => DEFAULT_THEME_ID);
  const setTheme = useCallback(
    (id: number) => {
      if (!isValidThemeId(id)) return;
      applyTheme(id); // live attribute + cookie
      router.refresh(); // re-run SSR so server-rendered chrome/markup matches
    },
    [router],
  );
  return { themeId, enabled: THEME_SWITCHING_ENABLED, themes: THEMES, setTheme };
}

/**
 * Ready-made picker (buttons by number/name). Renders NOTHING while switching is dormant,
 * so it's safe to place anywhere now; it lights up the moment the master switch is on.
 * Drop it into the dashboard (or the user nav, later).
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { themeId, enabled, themes, setTheme } = useTheme();
  if (!enabled) return null;
  return (
    <div role="radiogroup" aria-label="السمة" className={className} style={{ display: "inline-flex", gap: 6 }}>
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={t.id === themeId}
          onClick={() => setTheme(t.id)}
          title={`${t.name} (#${t.id})`}
          style={{
            padding: "4px 10px",
            borderRadius: 8,
            fontWeight: 700,
            border: "1px solid var(--fb-gold)",
            background: t.id === themeId ? "var(--fb-gold)" : "transparent",
            color: t.id === themeId ? "var(--fb-bg)" : "var(--fb-text)",
          }}
        >
          {t.id}
        </button>
      ))}
    </div>
  );
}
