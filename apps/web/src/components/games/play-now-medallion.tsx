import { cn } from "@/lib/utils";

/**
 * Theme 1 (Daylight) quick-play tap icon for each game's home hero — a clean,
 * live, pulsing gold medallion with the label "العب الآن" (Play Now) INSIDE it
 * (a play glyph over the text), plus a slowly rotating gold sheen ring and a
 * breathing pulse. Shared by Link Up + Top Ten so the two heroes stay in sync.
 *
 * Visibility is theme-scoped by the shared `.lu-cta-playnow` token toggle
 * (defined in @fb/theme core.css / theme-N.css): shown ONLY under [data-theme="1"];
 * every other theme keeps the live fireball (`.lu-cta-fireball`). It sits in the
 * SAME slot as the fireball orb — exactly one is displayed at a time.
 */
export function PlayNowMedallion({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "lu-cta-playnow lu-chip lu-anim-breathe relative size-48 place-items-center overflow-hidden rounded-full ring-1 ring-[var(--lu-gold-1)]/40 shadow-[0_18px_60px_rgb(var(--c-ember)/0.35)] transition-transform duration-300 group-hover:scale-[1.03] group-active:scale-95",
        className,
      )}
    >
      {/* slow rotating gold sheen ring — subtle premium "live" energy */}
      <span
        aria-hidden
        className="lu-anim-spin absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgb(var(--c-gold-1)/0.5) 40deg, transparent 120deg, transparent 230deg, rgb(var(--c-gold-2)/0.45) 300deg, transparent 360deg)",
          WebkitMaskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 4px), rgb(var(--c-black)) calc(100% - 4px))",
          maskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 4px), rgb(var(--c-black)) calc(100% - 4px))",
        }}
      />
      {/* play glyph + label — the icon literally reads العب الآن */}
      <span className="relative flex flex-col items-center gap-1.5">
        <svg
          aria-hidden
          width={34}
          height={34}
          viewBox="0 0 24 24"
          style={{
            transform: "translateX(0.5px)",
            filter:
              "drop-shadow(0 1px 1px rgb(var(--c-black)/0.4)) drop-shadow(0 0 8px rgb(var(--c-ember-glow)/0.45))",
          }}
        >
          <path
            d="M9 7l9 5-9 5z"
            fill="rgb(var(--c-gold-1))"
            stroke="rgb(var(--c-gold-1))"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </svg>
        <span className="lu-gold-text lu-gold-title text-xl font-black leading-none">العب الآن</span>
      </span>
    </span>
  );
}
