"use client";

import { useState } from "react";
import { cn } from "./cn.js";

/** Deterministic gradient hue for a generated avatar fallback. */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/**
 * Player avatar for a table seat: loads the uploaded image by public number from
 * `/api/profile/avatar/by-number/<n>` (each app provides that route), and falls back
 * to a generated gradient if there's none (the 404 sets `failed`, which persists for
 * the mounted seat — no repeated requests). Shared by Link Up and Top Ten.
 */
export function SeatAvatar({
  playerNumber,
  seed,
  size = 44,
  sizeClass,
  className,
}: {
  playerNumber: number;
  seed: string;
  size?: number;
  /** Responsive box dimensions via Tailwind (e.g. "size-9 sm:size-11"). When set
   *  it drives the size and `size` is used only for the fallback glyph font. */
  sizeClass?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const hue = hueFromSeed(seed);
  return (
    <div
      className={cn("overflow-hidden rounded-full bg-[#0b1120]", sizeClass, className)}
      style={sizeClass ? undefined : { width: size, height: size }}
    >
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/profile/avatar/by-number/${playerNumber}`}
          alt=""
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div
          className="grid size-full place-items-center font-black text-white"
          style={{
            fontSize: size * 0.4,
            background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
          }}
          aria-hidden
        >
          {seed.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}
