"use client";

import { motion } from "framer-motion";
import { HAND_RANK_CATALOG, type CardView, type PlayerView } from "@fp/shared";
import { cn } from "@/lib/utils";

/** code → Arabic rank name, from the canonical catalog (data-driven). */
export const RANK_NAME_AR: Record<string, string> = Object.fromEntries(
  HAND_RANK_CATALOG.map((r) => [r.code, r.nameAr]),
);

const POSITION_AR: Record<string, string> = {
  GK: "حارس",
  DEF: "مدافع",
  MID: "وسط",
  FWD: "مهاجم",
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

const cardBase =
  "flex w-[88px] min-h-[124px] flex-col gap-1 rounded-xl border bg-linear-to-b from-[#1e2740] to-[#0f1626] p-2 shadow-md";

/** A football-player card (face-up) or a face-down back, with a deal animation. */
export function FootballCard({
  card,
  back,
  index = 0,
}: {
  card?: CardView | null;
  back?: boolean;
  index?: number;
}) {
  if (back || !card) {
    return (
      <div
        className={cn(
          cardBase,
          "items-center justify-center text-2xl [background:repeating-linear-gradient(45deg,#16203a,#16203a_8px,#1b2747_8px,#1b2747_16px)]",
        )}
        aria-label="بطاقة مغلقة"
      >
        🂠
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -18, rotate: -6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
      className={cardBase}
      title={card.name}
    >
      <span className="self-start rounded-md bg-primary px-1.5 py-0.5 text-[0.66rem] font-extrabold text-primary-foreground">
        {POSITION_AR[card.position] ?? card.position}
      </span>
      <span className="text-sm font-extrabold leading-tight">{card.name}</span>
      <span className="mt-auto text-[0.68rem] text-muted-foreground">
        {card.nationality}
        {card.clubs[0] ? ` · ${card.clubs[0]}` : ""}
      </span>
    </motion.div>
  );
}

export function PlayerSeat({
  player,
  isActive,
  isYou,
}: {
  player: PlayerView;
  isActive: boolean;
  isYou: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 bg-black/40 p-3 backdrop-blur transition",
        isActive && "border-primary animate-turn",
        player.status === "FOLDED" && "opacity-45 grayscale",
        player.status === "ALLIN" && "border-gold glow-gold",
      )}
    >
      <div className="flex items-center justify-between gap-1 font-bold">
        <span>
          {player.username}
          {isYou ? " (أنت)" : ""}
        </span>
        {player.isDealer ? (
          <span
            className="grid size-5 place-items-center rounded-full bg-white text-[0.7rem] font-black text-black"
            title="الموزّع"
          >
            D
          </span>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="num">#{player.playerNumber}</span>
        {" · "}
        {STATUS_AR[player.status] ?? player.status}
      </div>
      {player.committedTotal > 0 ? (
        <div className="text-xs text-muted-foreground">
          رهانه: 🪙 <span className="num">{player.committedTotal}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Drains right→left over the remaining time of the current turn (RTL). */
export function TurnTimer({ deadlineTs }: { deadlineTs: number | null }) {
  if (!deadlineTs) return null;
  const remaining = Math.max(0, deadlineTs - Date.now());
  return (
    <div className="h-[5px] w-full overflow-hidden rounded-full bg-white/10">
      <motion.div
        key={deadlineTs}
        className="h-full origin-right bg-linear-to-l from-primary to-accent"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: remaining / 1000, ease: "linear" }}
      />
    </div>
  );
}
