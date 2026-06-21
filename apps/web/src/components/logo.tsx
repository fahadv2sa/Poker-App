import { cn } from "@/lib/utils";

/**
 * Brand mark — the suit-panel football, served from /logo-mark.svg (scales
 * sharply at any size, cached, no inline path bloat). `glow` adds the premium
 * emerald halo used in the home-screen hero.
 */
export function Logo({
  className,
  glow = false,
  alt = "",
}: {
  className?: string;
  glow?: boolean;
  alt?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/logo-mark.svg"
      alt={alt}
      aria-hidden={alt === ""}
      className={cn(
        "select-none object-contain",
        glow && "[filter:drop-shadow(0_6px_22px_color-mix(in_oklch,var(--primary)_45%,transparent))]",
        className,
      )}
    />
  );
}
