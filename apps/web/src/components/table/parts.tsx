"use client";

import { HAND_RANK_CATALOG, type CardView, type PlayerView } from "@fp/shared";

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

/** A football-player card (face-up) or a face-down back. */
export function FootballCard({ card, back }: { card?: CardView | null; back?: boolean }) {
  if (back || !card) {
    return <div className="fcard back" aria-label="بطاقة مغلقة">🂠</div>;
  }
  return (
    <div className="fcard" title={card.name}>
      <span className="pos">{POSITION_AR[card.position] ?? card.position}</span>
      <span className="pname">{card.name}</span>
      <span className="meta">
        {card.nationality}
        {card.clubs[0] ? ` · ${card.clubs[0]}` : ""}
      </span>
    </div>
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
  const cls = [
    "seat",
    isActive ? "active" : "",
    player.status === "FOLDED" ? "folded" : "",
    player.status === "ALLIN" ? "allin" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className="name">
        <span>
          {player.username}
          {isYou ? " (أنت)" : ""}
        </span>
        {player.isDealer ? <span className="dealer-badge" title="الموزّع">D</span> : null}
      </div>
      <div className="sub">
        <span className="num">#{player.playerNumber}</span>
        {" · "}
        <span className="status">{STATUS_AR[player.status] ?? player.status}</span>
      </div>
      {player.committedTotal > 0 ? (
        <div className="sub">
          رهانه: 🪙 <span className="num">{player.committedTotal}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Drains right→left over the remaining time of the current turn (RTL). The CSS
 * `drain` animation runs for exactly the time left; `key={deadlineTs}` restarts
 * it when a new turn begins.
 */
export function TurnTimer({ deadlineTs }: { deadlineTs: number | null }) {
  if (!deadlineTs) return null;
  const remaining = Math.max(0, deadlineTs - Date.now());
  return (
    <div className="timer" aria-label="الوقت المتبقّي للدور">
      <span key={deadlineTs} style={{ animationDuration: `${remaining}ms` }} />
    </div>
  );
}
