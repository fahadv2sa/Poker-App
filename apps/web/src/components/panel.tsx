import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Elevated surface (Arena Felt) — the premium replacement for the flat shadcn
 * Card on redesigned pages. `accent` adds the mint→cyan top-line. Visual only.
 */
export function Panel({
  children,
  className,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("panel p-6 sm:p-8", accent && "panel-accent", className)}>{children}</div>
  );
}
