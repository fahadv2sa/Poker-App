import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Unified page header (Arena Felt): an accent icon-chip + title + optional
 * subtitle, with a standardized back link. Visual only — replaces the old
 * "tiny dot + bold title" pattern across every in-scope page.
 */
export function PageHeader({
  icon,
  title,
  subtitle,
  backHref = "/",
  accent = "primary",
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  backHref?: string;
  accent?: "primary" | "gold" | "cyan";
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative z-10 mb-6 flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "section-ico shrink-0",
          accent === "gold" && "section-ico-gold",
          accent === "cyan" && "section-ico-cyan",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-black leading-tight sm:text-2xl">{title}</h1>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
        ) : null}
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-2">
        {action}
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>← القائمة</Link>
        </Button>
      </div>
    </header>
  );
}
