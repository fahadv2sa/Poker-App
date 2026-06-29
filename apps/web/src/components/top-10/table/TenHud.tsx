"use client";

import { motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import { SeatAvatar, Countdown, useRemainingMs, TurnFrame } from "@fb/table-ui";
import type { TtSeatView } from "@fb/shared";

/**
 * The local player's account, docked at the bottom (Link Up's "your seat HUD" recast
 * for trivia): avatar + name, total points, and this-round points (the live delta).
 * On your turn it glows ember and shows your own turn timer.
 */
export function TenHud({
  me,
  nickname,
  isMyTurn,
  deadlineTs,
  turnTotalMs = 30_000,
  hint = false,
  maxAttempts = 3,
}: {
  me: TtSeatView;
  nickname: string;
  isMyTurn: boolean;
  deadlineTs: number | null;
  turnTotalMs?: number;
  /** Hint mode: show this player's remaining attempts / lockout. */
  hint?: boolean;
  maxAttempts?: number;
}) {
  const remainingMs = useRemainingMs(isMyTurn ? deadlineTs : null);
  const locked = hint && me.locked;
  return (
    <div className="mx-auto flex w-full max-w-md shrink-0 items-stretch justify-center gap-1.5">
      <div
        className={cn(
          "relative flex flex-1 items-center gap-2 rounded-2xl border bg-[#0b0908]/80 px-2.5 py-1.5 backdrop-blur transition",
          isMyTurn ? "border-[var(--lu-ember-glow)]/50 lu-glow-ember" : "border-[var(--lu-gold-1)]/15",
        )}
      >
        {isMyTurn ? <TurnFrame remainingMs={remainingMs} totalMs={turnTotalMs} radius={16} /> : null}
        <SeatAvatar
          playerNumber={me.playerNumber}
          seed={me.username}
          size={34}
          sizeClass="size-9 sm:size-10"
          className={cn("ring-1", isMyTurn ? "ring-2 ring-[var(--lu-ember-glow)]" : "ring-white/15")}
        />
        <div className={cn("flex min-w-0 flex-col leading-tight", locked && "opacity-50")}>
          <span className="truncate text-sm font-bold text-[var(--lu-cream)]">{nickname}</span>
          {locked ? (
            <span className="text-[0.66rem] font-black text-[#d9694f]">✕ نَفِدت محاولاتك</span>
          ) : hint ? (
            <span className="flex items-center gap-1.5 text-[0.62rem] font-bold text-[var(--lu-cream)]">
              <span className="text-[var(--lu-tan)]">محاولات خاطئة</span>
              <span className="flex gap-0.5">
                {Array.from({ length: maxAttempts }).map((_, i) => (
                  <span key={i} className={cn("size-2 rounded-full border", i < me.wrongAttempts ? "border-[#d9694f] bg-[#d9694f]" : "border-white/30 bg-transparent")} />
                ))}
              </span>
              <span className="num font-black text-[#d9694f]">{me.wrongAttempts}/{maxAttempts}</span>
            </span>
          ) : isMyTurn ? (
            <span className="text-[0.66rem] font-bold text-[var(--lu-ember-glow)]">دورك — اكتب اسم لاعب</span>
          ) : (
            <span className="text-[0.62rem] text-[var(--lu-tan)]/80">بانتظار دورك…</span>
          )}
        </div>
      </div>

      {/* total points */}
      <Stat label="نقاطي" value={me.totalPoints} tone="gold" />
      {/* this-round delta — the fly-target for reveal stars; pops when it rises */}
      <Stat label="هذه الجولة" value={me.roundPoints} tone="round" signed anchor="ten-mine" pop />
      {isMyTurn ? (
        <div className="flex min-w-[3.4rem] items-center justify-center rounded-2xl border border-[var(--lu-ember-glow)]/40 bg-[var(--lu-ember)]/10 px-1">
          <Countdown deadlineTs={deadlineTs} totalMs={turnTotalMs} />
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  signed = false,
  anchor,
  pop = false,
}: {
  label: string;
  value: number;
  tone: "gold" | "round";
  signed?: boolean;
  anchor?: string;
  pop?: boolean;
}) {
  const tones = {
    gold: "border-[var(--lu-gold-1)]/45 bg-[var(--lu-gold-2)]/10 text-[var(--lu-gold-1)]",
    round: "border-[var(--lu-ember-glow)]/45 bg-[var(--lu-ember)]/10 text-[var(--lu-ember-glow)]",
  } as const;
  return (
    <div data-fx={anchor} className={cn("flex min-w-[3.2rem] flex-col items-center justify-center rounded-2xl border px-1.5 py-1", tones[tone])}>
      <span className="text-[0.55rem] font-bold tracking-wide opacity-75">{label}</span>
      <motion.span key={pop ? value : undefined} initial={pop ? { scale: 1.5 } : false} animate={pop ? { scale: 1 } : undefined} transition={{ type: "spring", stiffness: 320, damping: 16 }} className="num text-base font-black leading-none">
        {signed && value > 0 ? "+" : ""}
        {value}
      </motion.span>
    </div>
  );
}
