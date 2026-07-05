"use client";

import { cn } from "@fb/top-10-ui";
import { SeatAvatar, Countdown, TurnFrame, useRemainingMs } from "@fb/table-ui";
import type { TtSeatView } from "@fb/shared";

/**
 * A seated opponent on the Top Ten table rim. Mirrors Link Up's OpponentSeat: avatar
 * with a state-encoding ring + a depleting turn-frame + numeric countdown when it's
 * their turn, name, and the round-points chip. `claimed` = cards this seat revealed
 * this round. Withdrawn/locked seats dim.
 */
export function TenSeat({
  seat,
  isActive,
  deadlineTs,
  turnTotalMs = 30_000,
  onTap,
}: {
  seat: TtSeatView;
  isActive: boolean;
  deadlineTs: number | null;
  turnTotalMs?: number;
  /** Tap to open the contestant's profile (view / like / friend / report). */
  onTap?: () => void;
}) {
  const remainingMs = useRemainingMs(isActive ? deadlineTs : null);
  const withdrawn = seat.status === "WITHDRAWN";
  const away = seat.away && !withdrawn;
  const ring = isActive ? "ring-2 ring-[var(--lu-ember-glow)] lu-glow-ember" : seat.locked ? "ring-1 ring-[var(--lu-ember)]/40" : "ring-1 ring-white/15";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`ملف ${seat.username}`}
      className={cn(
        "relative flex w-[clamp(52px,18vw,76px)] flex-col items-center gap-0.5 rounded-2xl border bg-[var(--fb-surface)]/75 px-1 py-1 text-center backdrop-blur transition",
        isActive ? "lu-turn border-[var(--lu-ember-glow)]/50" : "border-[var(--lu-gold-1)]/15",
        withdrawn && "opacity-45 grayscale",
        away && "border-[var(--lu-amber,var(--fb-amber))]/60 opacity-70",
      )}
    >
      {isActive ? <TurnFrame remainingMs={remainingMs} totalMs={turnTotalMs} radius={16} /> : null}
      <div className="relative">
        <SeatAvatar playerNumber={seat.playerNumber} seed={seat.username} size={36} sizeClass="size-9 sm:size-10" className={cn(ring, away && "grayscale")} />
        {isActive ? (
          <span className="absolute -top-1 -right-1 z-10 rounded-full bg-[rgb(var(--c-navy-2))] px-0.5">
            <Countdown deadlineTs={deadlineTs} totalMs={turnTotalMs} compact />
          </span>
        ) : null}
        {away ? (
          <span className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-400/60 bg-black/85 px-1.5 text-[0.5rem] font-black text-amber-300 shadow">
            غادر
          </span>
        ) : null}
      </div>
      {/* name */}
      <span className="max-w-full truncate text-[clamp(0.56rem,2.4vw,0.7rem)] font-bold leading-tight text-[var(--lu-cream)]">
        {seat.username}
      </span>
      {/* cumulative TOTAL points (across all rounds) — single figure, no breakdown, no level */}
      <span className="num inline-flex items-center gap-0.5 rounded-full bg-[var(--gold)]/10 px-1.5 text-[clamp(0.54rem,2.3vw,0.66rem)] font-bold text-[var(--gold)]">
        {seat.totalPoints}
        <span className="text-[0.8em] font-normal opacity-70">نقطة</span>
      </span>
    </button>
  );
}
