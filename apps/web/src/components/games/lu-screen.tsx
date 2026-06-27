import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BackIcon, GoldGradientDefs } from "./lu-icons";

/**
 * Shared chrome for the gold-on-black redesign (docs/DESIGN_BRIEF.md §8): the
 * cinematic page wrapper + a standard gold page header. Reused by every
 * non-hero screen so the whole product reads as one world. Pure presentation.
 */

/** Gradient-only cinematic backdrop — gold motif, ember/gold light pools, vignette. */
export function LuAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px)",
          WebkitMaskImage: "radial-gradient(120% 80% at 50% 12%, #000 28%, transparent 78%)",
          maskImage: "radial-gradient(120% 80% at 50% 12%, #000 28%, transparent 78%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 40% at 50% 4%, rgba(255,106,26,0.15), transparent 55%), radial-gradient(90% 36% at 50% 100%, rgba(201,150,46,0.1), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 60%, rgba(0,0,0,0.6) 100%)" }}
      />
    </div>
  );
}

/** The page wrapper: centered phone column, abyss base, atmosphere, safe-area top. */
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

/** Standard gold page header: back button (right) + icon chip + title/subtitle. */
export function LuHeader({
  icon,
  title,
  subtitle,
  back = "/games/link-up",
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  back?: string;
}) {
  return (
    <header className="flex items-center gap-3 pb-2 pt-1">
      <Link
        href={back}
        aria-label="رجوع"
        className="lu-btn lu-frame grid size-10 shrink-0 place-items-center rounded-xl"
      >
        <BackIcon size={20} />
      </Link>
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

/** Elevated gold panel — the standard content surface. */
export function LuPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("lu-frame rounded-2xl p-5", className)}>{children}</section>;
}
