import type { ReactNode } from "react";
import { BackIcon, GoldGradientDefs, cn } from "@fb/top-10-ui";
import { BackArrow } from "@/components/back-arrow";

/**
 * Shared chrome — COPIED from Top Ten's lu-screen.tsx (itself copied from Link
 * Up) so Guess the Player's pages are visually identical to both games. Each
 * game keeps its own copy by design (no cross-game imports).
 */

export function LuAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(60deg, rgb(var(--c-gold-1)/0.6) 0, rgb(var(--c-gold-1)/0.6) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-60deg, rgb(var(--c-gold-1)/0.6) 0, rgb(var(--c-gold-1)/0.6) 1px, transparent 1px, transparent 26px)",
          WebkitMaskImage: "radial-gradient(120% 80% at 50% 12%, rgb(var(--c-black)) 28%, transparent 78%)",
          maskImage: "radial-gradient(120% 80% at 50% 12%, rgb(var(--c-black)) 28%, transparent 78%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 40% at 50% 4%, rgb(var(--c-ember)/0.15), transparent 55%), radial-gradient(90% 36% at 50% 100%, rgb(var(--c-gold-2)/0.1), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 60%, rgb(var(--c-black)/0.6) 100%)" }}
      />
    </div>
  );
}

export function LuScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={cn(
        "relative mx-auto min-h-[100dvh] max-w-[30rem] overflow-hidden bg-[var(--lu-abyss)] px-5 pb-10 page-top",
        className,
      )}
    >
      <GoldGradientDefs />
      <LuAtmosphere />
      <div className="relative z-10">{children}</div>
    </main>
  );
}

export function LuHeader({
  icon,
  title,
  subtitle,
  back = "/games/guess-player",
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  back?: string;
}) {
  return (
    <header className="flex items-center gap-3 pb-2 pt-1">
      <BackArrow fallback={back} className="lu-btn lu-frame grid size-10 shrink-0 place-items-center rounded-xl">
        <BackIcon size={20} />
      </BackArrow>
      <span className="lu-chip grid size-11 shrink-0 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/30">
        {icon}
      </span>
      <div className="min-w-0">
        <h1 className="lu-gold-text lu-gold-title truncate text-xl font-black leading-tight">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-[var(--lu-tan)]">{subtitle}</p> : null}
      </div>
    </header>
  );
}

export function LuPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("lu-frame rounded-2xl p-5", className)}>{children}</section>;
}
