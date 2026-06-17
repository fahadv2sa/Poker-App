"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { CardView, PlayerView } from "@fp/shared";
import { cn } from "@/lib/utils";

// Rank display names are NOT hardcoded — they arrive in the showdown:start
// payload as `nameAr`, sourced from the DB (hand_ranks.name_ar). See FIX #5.

export const PHASE_AR: Record<string, string> = {
  LOBBY: "الانتظار",
  PREFLOP: "ما قبل الفلوب",
  FLOP: "الفلوب",
  TURN: "التيرن",
  RIVER: "الريفر",
  SHOWDOWN: "الكشف",
  RESOLVE: "التوزيع",
  ENDED: "انتهت",
};

const STATUS_AR: Record<string, string> = {
  WAITING: "بالانتظار",
  ACTIVE: "نشط",
  FOLDED: "منسحب",
  ALLIN: "كل الرصيد",
  DISCONNECTED: "غير متصل",
};

/**
 * A football-player card (DISPLAY ONLY). Batch 2: shows ONLY the player's name —
 * English, a divider, then Arabic — centred in the middle of the card. The
 * club/nationality/position are deliberately NOT shown (they remain in the DB
 * and drive every rank calculation server-side; they're just hidden here).
 */
export function FootballCard({
  card,
  back,
  index = 0,
  size = "md",
}: {
  card?: CardView | null;
  back?: boolean;
  index?: number;
  size?: "md" | "lg";
}) {
  const dims =
    size === "lg"
      ? "w-[104px] min-h-[150px] p-3"
      : "w-[68px] min-h-[98px] p-2 sm:w-[76px] sm:min-h-[108px]";

  if (back || !card) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-white/10 text-2xl text-white/30",
          "[background:repeating-linear-gradient(135deg,#101a30,#101a30_7px,#16223c_7px,#16223c_14px)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
          dims,
        )}
        aria-label="بطاقة مغلقة"
      >
        ♣
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, rotate: -4, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ duration: 0.38, delay: index * 0.07, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 text-center",
        "bg-linear-to-b from-[#202a44] to-[#0e1626]",
        "shadow-[0_6px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]",
        dims,
      )}
      title={card.name}
    >
      {/* English name */}
      <span
        className={cn(
          "font-extrabold leading-tight",
          size === "lg" ? "text-[0.95rem]" : "text-[0.72rem]",
        )}
      >
        {card.name}
      </span>
      {/* divider between the two names */}
      <span className="h-px w-3/4 bg-white/20" aria-hidden />
      {/* Arabic name (data-driven from the DB) */}
      <span
        className={cn(
          "font-bold leading-tight text-white/80",
          size === "lg" ? "text-[0.9rem]" : "text-[0.7rem]",
        )}
      >
        {card.nameAr ?? card.name}
      </span>
    </motion.div>
  );
}

/** Compact opponent seat placed around the table rim. When it's this seat's
 *  turn, shows a strong "now playing" highlight + live countdown ON the seat
 *  (A2); shows a "claimed" badge at showdown (A3). */
export function OpponentSeat({
  player,
  isActive,
  deadlineTs,
  hasClaimed = false,
}: {
  player: PlayerView;
  isActive: boolean;
  deadlineTs?: number | null;
  hasClaimed?: boolean;
}) {
  return (
    <motion.div
      layout
      className={cn(
        "flex min-w-[120px] flex-col gap-0.5 rounded-xl border px-3 py-2 backdrop-blur transition",
        "border-white/10 bg-[#070b14]/70",
        isActive && "border-primary bg-primary/10 glow-primary animate-turn ring-2 ring-primary/60",
        player.status === "FOLDED" && "opacity-40 grayscale",
        player.status === "ALLIN" && "border-gold/70 glow-gold",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold">{player.username}</span>
        <div className="flex shrink-0 items-center gap-1">
          {isActive ? <Countdown deadlineTs={deadlineTs ?? null} compact /> : null}
          {player.isDealer ? (
            <span
              className="grid size-4 place-items-center rounded-full bg-white text-[0.6rem] font-black text-black"
              title="الموزّع"
            >
              D
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[0.68rem] text-muted-foreground">
        <span>
          {isActive ? (
            <span className="font-bold text-primary">يلعب الآن…</span>
          ) : hasClaimed ? (
            <span className="font-bold text-accent">اختار ✓</span>
          ) : (
            (STATUS_AR[player.status] ?? player.status)
          )}
        </span>
        {player.committedTotal > 0 ? (
          <span className="text-gold">
            🪙 <span className="num">{player.committedTotal}</span>
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Live remaining time (ms) until `deadlineTs`, re-rendered ~4×/sec. */
export function useRemainingMs(deadlineTs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineTs == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadlineTs]);
  if (deadlineTs == null) return null;
  return Math.max(0, deadlineTs - now);
}

/**
 * A live, numeric countdown for the current turn / claim window. `compact` is the
 * small seat badge; otherwise a labelled number + draining bar. The server sends
 * the authoritative `deadlineTs`; this just renders it ticking.
 */
export function Countdown({
  deadlineTs,
  totalMs = 60_000,
  compact = false,
}: {
  deadlineTs: number | null;
  totalMs?: number;
  compact?: boolean;
}) {
  const remMs = useRemainingMs(deadlineTs);
  if (remMs == null) return null;
  const secs = Math.ceil(remMs / 1000);
  const pct = Math.max(0, Math.min(100, (remMs / totalMs) * 100));
  const danger = secs <= 10;

  if (compact) {
    return (
      <span
        className={cn(
          "num rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold tabular-nums",
          danger ? "bg-destructive/20 text-destructive" : "bg-primary/15 text-primary",
        )}
      >
        {secs}
      </span>
    );
  }
  return (
    <div className="flex w-full max-w-[260px] flex-col items-center gap-1">
      <span
        className={cn(
          "num text-sm font-bold tabular-nums",
          danger ? "text-destructive" : "text-primary",
        )}
      >
        ⏱ {secs} ث
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            danger ? "bg-destructive" : "bg-linear-to-l from-primary to-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
