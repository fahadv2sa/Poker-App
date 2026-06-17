"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { CardView, PlayerView } from "@fp/shared";
import { cn } from "@/lib/utils";

// Rank display names are NOT hardcoded — they arrive in the showdown:start
// payload as `nameAr`, sourced from the DB (hand_ranks.name_ar). See FIX #5.

const POSITION_AR: Record<string, string> = {
  GK: "حارس",
  DEF: "مدافع",
  MID: "وسط",
  FWD: "مهاجم",
};

// Position accent — purely a readability aid for the card's own info, no advice.
const POSITION_ACCENT: Record<string, string> = {
  GK: "var(--gold)",
  DEF: "var(--accent)",
  MID: "var(--primary)",
  FWD: "var(--destructive)",
};

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
 * A football-player card (display only). Two sizes: compact for the community,
 * large for the player's own hole cards. Shows player, nationality, position,
 * and a club — elegantly, with no analysis.
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
      ? "w-[104px] min-h-[150px] p-3 gap-1.5"
      : "w-[68px] min-h-[98px] p-2 gap-1 sm:w-[76px] sm:min-h-[108px]";

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

  const accent = POSITION_ACCENT[card.position] ?? "var(--primary)";
  return (
    <motion.div
      initial={{ opacity: 0, y: -14, rotate: -4, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ duration: 0.38, delay: index * 0.07, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn(
        "relative flex flex-col rounded-xl border border-white/10 bg-linear-to-b from-[#202a44] to-[#0e1626]",
        "shadow-[0_6px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]",
        dims,
      )}
      title={card.name}
    >
      <span
        className="absolute inset-y-2 start-0 w-[3px] rounded-full"
        style={{ background: accent }}
        aria-hidden
      />
      <span
        className={cn(
          "self-start rounded-md px-1.5 py-0.5 font-extrabold text-[#04121a]",
          size === "lg" ? "text-[0.7rem]" : "text-[0.62rem]",
        )}
        style={{ background: accent }}
      >
        {POSITION_AR[card.position] ?? card.position}
      </span>
      <span
        className={cn(
          "font-extrabold leading-tight",
          size === "lg" ? "text-[0.95rem]" : "text-[0.78rem]",
        )}
      >
        {card.name}
      </span>
      <span
        className={cn(
          "mt-auto leading-tight text-muted-foreground",
          size === "lg" ? "text-[0.74rem]" : "text-[0.64rem]",
        )}
      >
        {card.nationality}
        {card.clubs[0] ? <span className="opacity-70"> · {card.clubs[0]}</span> : null}
      </span>
    </motion.div>
  );
}

/** Compact opponent seat placed around the table rim. When it's this seat's
 *  turn, shows the live remaining-time countdown ON the seat (Batch 1). */
export function OpponentSeat({
  player,
  isActive,
  deadlineTs,
}: {
  player: PlayerView;
  isActive: boolean;
  deadlineTs?: number | null;
}) {
  return (
    <motion.div
      layout
      className={cn(
        "flex min-w-[120px] flex-col gap-0.5 rounded-xl border px-3 py-2 backdrop-blur",
        "border-white/10 bg-[#070b14]/70",
        isActive && "border-primary/70 animate-turn",
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
        <span>{STATUS_AR[player.status] ?? player.status}</span>
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
