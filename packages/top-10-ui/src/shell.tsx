import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn.js";
import { GoldGradientDefs } from "./icons.js";

export type NavItem = { label: string; href: string };

/**
 * Cinematic gold-on-black background — COPIED from Link Up's home Atmosphere
 * (gradient gold mesh + molten dot texture + ember/gold light pools + vignette).
 * Pure/decorative.
 */
export function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px)",
          WebkitMaskImage: "radial-gradient(120% 100% at 50% 45%, #000 30%, transparent 78%)",
          maskImage: "radial-gradient(120% 100% at 50% 45%, #000 30%, transparent 78%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,179,71,0.7) 1px, transparent 1.4px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 50% at 50% 14%, rgba(255,106,26,0.16), transparent 55%), radial-gradient(95% 42% at 50% 100%, rgba(201,150,46,0.14), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.65) 100%)" }}
      />
    </div>
  );
}

/**
 * Mobile-first page column with the atmosphere + gold-gradient defs + top safe
 * area — the shared frame every Top Ten page sits in (mirrors Link Up's home main).
 */
export function AppShell({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <main
      className={cn(
        "relative mx-auto flex min-h-[100dvh] max-w-[26rem] flex-col overflow-hidden bg-[var(--lu-abyss)] px-5 pb-4 page-top",
        className,
      )}
      style={style}
    >
      <GoldGradientDefs />
      <Atmosphere />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </main>
  );
}

/** Decorative-only placeholders kept for the barrel export (nav is composed in the
 *  app with next/link). */
export function TopBar({ children }: { children: ReactNode }) {
  return <header className="relative flex shrink-0 items-center justify-between gap-3 pt-1">{children}</header>;
}
export function BottomNav({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="التنقل" className="relative z-20 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
      <div className="lu-frame flex items-stretch justify-between gap-2 rounded-2xl px-3 py-2">{children}</div>
    </nav>
  );
}
