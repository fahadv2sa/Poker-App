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

/** Up-to-two-letter initials for the photo placeholder (first + last token). */
function cardInitials(name: string): string {
  const parts = name.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** A soft, gradient hairline separator (not a heavy line). */
function CardDivider() {
  return (
    <span
      className="my-0.5 h-px w-4/5 bg-linear-to-r from-transparent via-white/25 to-transparent"
      aria-hidden
    />
  );
}

/**
 * A football-player card (DISPLAY ONLY) — a premium trading-card look:
 * photo on top, then English name, Arabic name, and the club, each separated by
 * a soft divider, everything centred. The club/nationality/position remain in
 * the DB and drive every rank calculation server-side; this view only displays
 * the photo, the two names, and a single club label.
 *
 * NOTE: the club shown is the first entry in the card's club list. The imported
 * data carries no club recency (no years / current flag), so this is not
 * guaranteed to be the player's *current* club for multi-club players; it is
 * always correct for single-club players. No "current" claim is made in the UI.
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
  const [imgError, setImgError] = useState(false);
  const width = size === "lg" ? "w-[120px]" : "w-[80px] sm:w-[88px]";

  if (back || !card) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-white/10 text-2xl text-white/30",
          "aspect-[2/3]",
          "[background:repeating-linear-gradient(135deg,#101a30,#101a30_7px,#16223c_7px,#16223c_14px)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
          width,
        )}
        aria-label="بطاقة مغلقة"
      >
        ♣
      </div>
    );
  }

  const showPhoto = Boolean(card.photoUrl) && !imgError;
  const club = card.clubs.find((c) => c && c.trim()) ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, rotate: -4, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ duration: 0.38, delay: index * 0.07, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-white/10 text-center",
        "bg-linear-to-b from-[#202a44] to-[#0e1626]",
        "shadow-[0_6px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]",
        "transition duration-200 hover:-translate-y-0.5 hover:border-gold/40",
        "hover:shadow-[0_12px_26px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]",
        width,
      )}
      title={card.name}
    >
      {/* Photo — dominates the top, rounded by the card's overflow-hidden. */}
      <div className="relative w-full overflow-hidden bg-[#0b1322]">
        <div className="aspect-[4/5] w-full">
          {showPhoto ? (
            // Remote provider image; plain <img> avoids next/image remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.photoUrl!}
              alt={card.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-linear-to-b from-[#1b2742] to-[#0b1322]">
              <span
                className={cn(
                  "font-black tracking-wide text-white/40",
                  size === "lg" ? "text-2xl" : "text-lg",
                )}
              >
                {cardInitials(card.name)}
              </span>
            </div>
          )}
        </div>
        {/* Soft scrim blends the photo into the card body. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-[#101a2e] to-transparent" />
      </div>

      {/* Text block (centred): EN name · AR name · club, each soft-divided. */}
      <div className={cn("flex flex-col items-center", size === "lg" ? "gap-0.5 p-2" : "gap-0.5 p-1.5")}>
        <CardDivider />
        {/* English name (slightly smaller than Arabic) */}
        <span
          className={cn(
            "w-full truncate font-bold leading-tight text-white/90",
            size === "lg" ? "text-[0.78rem]" : "text-[0.6rem]",
          )}
        >
          {card.name}
        </span>
        <CardDivider />
        {/* Arabic name (data-driven from the DB; falls back to English) */}
        <span
          className={cn(
            "w-full truncate font-extrabold leading-tight",
            size === "lg" ? "text-[0.95rem]" : "text-[0.74rem]",
          )}
        >
          {card.nameAr ?? card.name}
        </span>
        <CardDivider />
        {/* Club — small, muted, elegant */}
        <span
          className={cn(
            "w-full truncate font-medium leading-tight text-gold/70",
            size === "lg" ? "text-[0.62rem]" : "text-[0.5rem]",
          )}
        >
          {club ?? "—"}
        </span>
      </div>
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
