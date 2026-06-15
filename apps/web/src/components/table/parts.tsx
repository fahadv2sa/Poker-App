"use client";

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

/** Compact opponent seat placed around the table rim. */
export function OpponentSeat({
  player,
  isActive,
}: {
  player: PlayerView;
  isActive: boolean;
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
        {player.isDealer ? (
          <span
            className="grid size-4 shrink-0 place-items-center rounded-full bg-white text-[0.6rem] font-black text-black"
            title="الموزّع"
          >
            D
          </span>
        ) : null}
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

/** Drains right→left over the remaining time of the current turn (RTL). */
export function TurnTimer({ deadlineTs }: { deadlineTs: number | null }) {
  if (!deadlineTs) return null;
  const remaining = Math.max(0, deadlineTs - Date.now());
  return (
    <div className="h-1.5 w-44 max-w-[60vw] overflow-hidden rounded-full bg-white/10">
      <motion.div
        key={deadlineTs}
        className="h-full origin-right rounded-full bg-linear-to-l from-primary to-accent"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: remaining / 1000, ease: "linear" }}
      />
    </div>
  );
}
