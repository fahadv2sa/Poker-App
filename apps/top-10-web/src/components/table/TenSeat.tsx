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
  claimed,
  turnTotalMs = 30_000,
}: {
  seat: TtSeatView;
  isActive: boolean;
  deadlineTs: number | null;
  claimed: number;
  turnTotalMs?: number;
}) {
  const remainingMs = useRemainingMs(isActive ? deadlineTs : null);
  const withdrawn = seat.status === "WITHDRAWN";
  const ring = isActive ? "ring-2 ring-[var(--lu-ember-glow)] lu-glow-ember" : seat.locked ? "ring-1 ring-[var(--lu-ember)]/40" : "ring-1 ring-white/15";

  return (
    <div
      className={cn(
        "relative flex w-[clamp(52px,18vw,76px)] flex-col items-center gap-0.5 rounded-2xl border bg-[#0b0908]/75 px-1 py-1 backdrop-blur transition",
        isActive ? "lu-turn border-[var(--lu-ember-glow)]/50" : "border-[var(--lu-gold-1)]/15",
        withdrawn && "opacity-45 grayscale",
      )}
    >
      {isActive ? <TurnFrame remainingMs={remainingMs} totalMs={turnTotalMs} radius={16} /> : null}
      <div className="relative">
        <SeatAvatar playerNumber={seat.playerNumber} seed={seat.username} size={36} sizeClass="size-9 sm:size-10" className={ring} />
        {isActive ? (
          <span className="absolute -top-1 -right-1 z-10 rounded-full bg-[#070b14] px-0.5">
            <Countdown deadlineTs={deadlineTs} totalMs={turnTotalMs} compact />
          </span>
        ) : null}
        {claimed > 0 ? (
          <span className="num absolute -bottom-1 -left-1 z-10 grid size-4 place-items-center rounded-full bg-[var(--gold)] text-[0.55rem] font-black text-black shadow" title="بطاقات كشفها هذه الجولة">
            {claimed}
          </span>
        ) : null}
      </div>
      <span className="max-w-full truncate text-[clamp(0.56rem,2.4vw,0.7rem)] font-bold leading-tight text-[var(--lu-cream)]">
        {seat.username}
        {seat.isBot ? " 🤖" : ""}
      </span>
      <span className="num inline-flex items-center gap-0.5 rounded-full bg-[var(--gold)]/10 px-1.5 text-[clamp(0.54rem,2.3vw,0.66rem)] font-bold text-[var(--gold)]">
        {seat.totalPoints}
        <span className="text-[0.8em] font-normal opacity-70">نقطة</span>
      </span>
    </div>
  );
}
