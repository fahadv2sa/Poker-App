"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { CardView, PlayerView } from "@fp/shared";
import { cn } from "@/lib/utils";
import { anim } from "@/lib/anim";
import { TurnFrame } from "./fx";

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

/** Position code → Arabic label (display only; the four canonical positions). */
const POSITION_AR: Record<string, string> = {
  GK: "حارس مرمى",
  DEF: "مدافع",
  MID: "وسط",
  FWD: "مهاجم",
};

/**
 * Shared full-screen player modal — the single expand/detail overlay reused by
 * every card (gameplay and the result screen). Shows the large photo, full
 * Arabic + English names, nationality, position, fame score, and the complete
 * career club history. Centred, scrollable, dark-themed; closes on the X,
 * outside click, or Escape. UI-only — reads what's already in CardView.
 */
export function PlayerCardModal({
  card,
  variant = "game",
  onClose,
}: {
  card: CardView;
  /** "game" shows only photo + names + score; "result" adds nationality,
   *  position, and the full career club history. */
  variant?: "game" | "result";
  onClose: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const showPhoto = Boolean(card.photoUrl) && !imgError;
  const fame = card.fameScore;
  const legendary = fame != null && fame >= 100;
  const clubs = card.clubs.filter((c) => c && c.trim());
  const positionAr = POSITION_AR[card.position] ?? card.position;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative my-auto max-h-[92vh] w-[88vw] max-w-[360px] overflow-y-auto rounded-2xl border text-center shadow-2xl",
          "bg-linear-to-b from-[#202a44] to-[#0e1626]",
          legendary ? "border-gold/80 shadow-[0_0_34px_rgba(212,175,55,0.6)]" : "border-white/15",
        )}
      >
        <button
          type="button"
          aria-label="إغلاق"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 grid size-8 place-items-center rounded-full bg-black/60 text-lg text-white/85 transition hover:bg-black/80"
        >
          ✕
        </button>

        {/* Large photo */}
        <div className="relative w-full overflow-hidden bg-[#0b1322]">
          <div className="aspect-[4/5] w-full">
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.photoUrl!}
                alt={card.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-linear-to-b from-[#1b2742] to-[#0b1322]">
                <span className="text-6xl font-black tracking-wide text-white/40">
                  {cardInitials(card.name)}
                </span>
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-[#101a2e] to-transparent" />
        </div>

        {/* Fame score — gold strip between photo and name (never over the face). */}
        {fame != null ? (
          <div
            className={cn(
              "flex w-full items-center justify-center gap-1.5 py-1 text-base font-black tabular-nums",
              legendary
                ? "bg-gold text-black shadow-[0_0_12px_rgba(212,175,55,0.7)]"
                : "border-y border-gold/30 bg-linear-to-b from-gold/30 to-gold/10 text-gold",
            )}
            title={`درجة الشهرة: ${Math.round(fame)}/100`}
          >
            <span aria-hidden className="opacity-80">★</span>
            {Math.round(fame)}
          </div>
        ) : null}

        <div className="flex flex-col items-stretch gap-3 p-5 text-center">
          {/* Full names — shown in both variants */}
          <div>
            <div className="break-words text-2xl font-extrabold">{card.nameAr ?? card.name}</div>
            <div className="mt-0.5 break-words text-sm text-white/70">{card.name}</div>
          </div>

          {/* Full player details — RESULT SCREEN ONLY. Hidden during gameplay so
              cards reveal only photo + name + score. */}
          {variant === "result" ? (
            <>
              {/* Nationality + position */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-[0.65rem] text-muted-foreground">الجنسية</div>
                  <div className="mt-0.5 break-words text-sm font-semibold">{card.nationality}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-[0.65rem] text-muted-foreground">المركز</div>
                  <div className="mt-0.5 break-words text-sm font-semibold">{positionAr}</div>
                </div>
              </div>

              {/* Full career club history */}
              <div>
                <div className="mb-1.5 text-xs font-semibold text-gold/80">مسيرة الأندية</div>
                {clubs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {clubs.map((c, i) => (
                      <div
                        key={`${c}-${i}`}
                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5"
                      >
                        <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[0.6rem] text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="flex-1 break-words text-right text-sm">{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </motion.div>
    </div>,
    document.body,
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
  variant = "game",
  reveal,
}: {
  card?: CardView | null;
  back?: boolean;
  index?: number;
  size?: "md" | "lg";
  /** "game" (default) reveals only photo/name/score on expand; "result" reveals
   *  the full player details. The card FACE is minimal in both contexts. */
  variant?: "game" | "result";
  /** Entrance flavor for the face (visual-only): "deal" = slide in from the deck
   *  (#5), "flip" = 3D flip reveal (#2). Falls back to the default drop-in when
   *  the matching animation flag is off, so base behavior is preserved. */
  reveal?: "deal" | "flip";
}) {
  const [imgError, setImgError] = useState(false);
  // Click-to-expand: any face-up card opens the shared PlayerCardModal with the
  // full player details. UI-only, local state — no gameplay impact.
  const [expanded, setExpanded] = useState(false);
  // Smaller on mobile so the 5-card board fits one row and the hand fits one
  // screen; full size on desktop (sm:) — keeps cards recognizable and crisp.
  const width = size === "lg" ? "w-[68px] sm:w-[120px]" : "w-[52px] sm:w-[88px]";

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
  const fame = card.fameScore;
  const legendary = fame != null && fame >= 100; // Messi (=100): special standout

  // Entrance flavor (visual-only). Each falls back to the original drop-in when
  // its flag is off, so the table looks unchanged with animations disabled.
  const entrance =
    reveal === "deal" && anim("dealFromDeck")
      ? {
          initial: { opacity: 0, y: -170, x: index % 2 === 0 ? -28 : 28, rotate: -10, scale: 0.82 },
          animate: { opacity: 1, y: 0, x: 0, rotate: 0, scale: 1 },
          transition: { duration: 0.5, delay: index * 0.09, ease: [0.22, 0.61, 0.36, 1] as const },
        }
      : reveal === "flip" && anim("cardFlip")
        ? {
            initial: { opacity: 0, rotateY: 90, scale: 0.92 },
            animate: { opacity: 1, rotateY: 0, scale: 1 },
            transition: { duration: 0.4, delay: index * 0.08, ease: "easeOut" as const },
          }
        : {
            initial: { opacity: 0, y: -14, rotate: -4, scale: 0.92 },
            animate: { opacity: 1, y: 0, rotate: 0, scale: 1 },
            transition: { duration: 0.38, delay: index * 0.07, ease: [0.22, 0.61, 0.36, 1] as const },
          };

  return (
    <>
    <motion.div
      initial={entrance.initial}
      animate={entrance.animate}
      transition={entrance.transition}
      style={{ transformPerspective: 700 }}
      role="button"
      tabIndex={0}
      aria-label={`توسيع بطاقة ${card.name}`}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(true);
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border text-center",
        "bg-linear-to-b from-[#202a44] to-[#0e1626]",
        "shadow-[0_6px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]",
        "transition duration-200 hover:-translate-y-0.5 hover:border-gold/40",
        "hover:shadow-[0_12px_26px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]",
        legendary
          ? "border-gold/80 shadow-[0_0_20px_rgba(212,175,55,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/10",
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

      {/* Fame score — gold strip between the photo and the name (never over the
          face). Legendary (Messi=100) gets a solid-gold standout. */}
      {fame != null ? (
        <div
          className={cn(
            "flex w-full items-center justify-center gap-1 font-black tabular-nums",
            legendary
              ? "bg-gold text-black shadow-[0_0_10px_rgba(212,175,55,0.7)]"
              : "border-y border-gold/30 bg-linear-to-b from-gold/30 to-gold/10 text-gold",
            size === "lg" ? "py-0.5 text-[0.6rem] sm:text-[0.72rem]" : "py-px text-[0.56rem]",
          )}
          title={`درجة الشهرة: ${Math.round(fame)}/100`}
        >
          <span aria-hidden className="text-[0.85em] opacity-80">★</span>
          {Math.round(fame)}
        </div>
      ) : null}

      {/* Text block (centred): EN name · AR name · club, each soft-divided. */}
      <div className={cn("flex flex-col items-center", size === "lg" ? "gap-0.5 p-1.5 sm:p-2" : "gap-0.5 p-1.5")}>
        <CardDivider />
        {/* English name (slightly smaller than Arabic) */}
        <span
          className={cn(
            "w-full truncate font-bold leading-tight text-white/90",
            size === "lg" ? "text-[0.64rem] sm:text-[0.78rem]" : "text-[0.6rem]",
          )}
        >
          {card.name}
        </span>
        <CardDivider />
        {/* Arabic name (data-driven from the DB; falls back to English) */}
        <span
          className={cn(
            "w-full truncate font-extrabold leading-tight",
            size === "lg" ? "text-[0.8rem] sm:text-[0.95rem]" : "text-[0.74rem]",
          )}
        >
          {card.nameAr ?? card.name}
        </span>
      </div>
    </motion.div>

      {/* Click-to-expand opens the shared PlayerCardModal. Its detail level is
          gated by `variant` (game = photo/name/score only). */}
      {expanded ? (
        <PlayerCardModal card={card} variant={variant} onClose={() => setExpanded(false)} />
      ) : null}
    </>
  );
}

/** Compact opponent seat placed around the table rim. When it's this seat's
 *  turn, shows a strong "now playing" highlight + live countdown ON the seat
 *  (A2); shows a "claimed" badge at showdown (A3). */
/** Deterministic gradient hue for a generated avatar fallback. */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Player avatar for the table: loads the uploaded image by public number, and
 *  falls back to a generated gradient if there's none (the 404 sets `failed`,
 *  which persists for the mounted seat — no repeated requests). */
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

/** A seated opponent: avatar (floodlight ring encoding state), name, status and
 *  committed chips. Tap to open the rich profile. The ring color is the state. */
export function OpponentSeat({
  player,
  isActive,
  deadlineTs,
  hasClaimed = false,
  onOpenProfile,
}: {
  player: PlayerView;
  isActive: boolean;
  deadlineTs?: number | null;
  hasClaimed?: boolean;
  /** Tap the seat to open this opponent's public profile (on-demand read). */
  onOpenProfile?: (playerNumber: number) => void;
}) {
  const folded = player.status === "FOLDED";
  const allin = player.status === "ALLIN";
  const remainingMs = useRemainingMs(deadlineTs ?? null);
  const ring = isActive
    ? "ring-2 ring-primary glow-primary"
    : allin
      ? "ring-2 ring-gold glow-gold"
      : "ring-1 ring-white/15";
  return (
    <motion.div
      layout
      data-fx={`seat-${player.seat}`}
      role={onOpenProfile ? "button" : undefined}
      title={onOpenProfile ? "عرض الملف الشخصي" : undefined}
      onClick={onOpenProfile ? () => onOpenProfile(player.playerNumber) : undefined}
      className={cn(
        "relative flex w-[58px] flex-col items-center gap-0.5 rounded-2xl border border-white/10 bg-[#070b14]/65 px-1 py-1 backdrop-blur transition sm:w-[84px] sm:gap-1 sm:px-1.5 sm:py-2",
        onOpenProfile && "cursor-pointer hover:border-primary/40 hover:bg-[#0a1020]/80",
        isActive && "animate-turn border-primary/50",
        folded && "opacity-45 grayscale",
      )}
    >
      {/* #1 depleting turn-timer frame tracing the whole profile card */}
      {isActive && anim("turnRing") ? <TurnFrame remainingMs={remainingMs} /> : null}
      <div className="relative">
        <SeatAvatar
          playerNumber={player.playerNumber}
          seed={player.username}
          size={36}
          sizeClass="size-9 sm:size-11"
          className={ring}
        />
        {player.isDealer ? (
          anim("dealerButton") ? (
            // #8 dealer "D" glides between seats via shared layout
            <motion.span
              layoutId="dealer-button"
              className="absolute -bottom-0.5 -left-0.5 z-10 grid size-4 place-items-center rounded-full bg-white text-[0.55rem] font-black text-black shadow"
              title="الموزّع"
            >
              D
            </motion.span>
          ) : (
            <span
              className="absolute -bottom-0.5 -left-0.5 z-10 grid size-4 place-items-center rounded-full bg-white text-[0.55rem] font-black text-black shadow"
              title="الموزّع"
            >
              D
            </span>
          )
        ) : null}
        {/* #7 fold stamp */}
        {folded && anim("foldMuck") ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded border border-destructive/70 bg-[#070b14]/70 px-1.5 text-[0.55rem] font-black tracking-wider text-destructive">
              انسحب
            </span>
          </span>
        ) : null}
        {isActive ? (
          <span className="absolute -top-1 -right-1 z-10 rounded-full bg-[#070b14] px-0.5">
            <Countdown deadlineTs={deadlineTs ?? null} compact />
          </span>
        ) : null}
      </div>
      <span className="max-w-full truncate text-[0.6rem] font-bold leading-tight sm:text-[0.72rem]">{player.username}</span>
      <span className="text-[0.55rem] leading-none sm:text-[0.6rem]">
        {isActive ? (
          <span className="font-bold text-primary">يلعب…</span>
        ) : hasClaimed ? (
          <span className="font-bold text-accent">اختار ✓</span>
        ) : (
          <span className="text-muted-foreground">{STATUS_AR[player.status] ?? player.status}</span>
        )}
      </span>
      {player.committedTotal > 0 ? (
        <span className="rounded-full bg-gold/10 px-1 text-[0.55rem] text-gold sm:px-1.5 sm:text-[0.6rem]">
          🪙 <span className="num">{player.committedTotal}</span>
        </span>
      ) : null}
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
