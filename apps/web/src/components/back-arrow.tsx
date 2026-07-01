"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Shared back control used by every page/screen header across the platform (both
 * games). Always goes to the PREVIOUS page (`router.back()`) when there is browser
 * history; only when there is none (e.g. a deep-link / fresh tab) does it fall back
 * to `fallback` (the game/platform home). Style- and icon-agnostic: pass the same
 * className + icon the page already uses, so the look is unchanged — only the
 * behaviour is unified. (The tap sound + press animation come from the app-wide
 * click handlers via the shared button classes, so nothing extra is needed here.)
 */
export function BackArrow({
  fallback = "/",
  className,
  children,
  label = "رجوع",
}: {
  /** Where to go only when there is no history to go back to. */
  fallback?: string;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button type="button" aria-label={label} onClick={onClick} className={className}>
      {children}
    </button>
  );
}
