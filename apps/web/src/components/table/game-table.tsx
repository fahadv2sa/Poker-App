"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  DEFAULT_GAME_CONFIG,
  NEW_ROUND_GRACE_SEC,
  type BestRankPayload,
  type ClaimEvidenceGroup,
  type GameResultEntry,
  type PlayerView,
} from "@fp/shared";
import { useGameSocket } from "@/lib/useGameSocket";
import { isMyTurn as selIsMyTurn, type RoundSummary } from "@/lib/tableView";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { SoundControl } from "@/components/sound-control";
import { ConfirmButtons } from "@/components/confirm-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Countdown, FootballCard, OpponentSeat, SeatAvatar } from "./parts";
import { OpponentProfileModal } from "./opponent-profile-modal";
import { FxProvider, useFx, CountUp, StreetFlourish } from "./fx";
import { anim } from "@/lib/anim";

const BETTING_PHASES = new Set(["PREFLOP", "FLOP", "TURN", "RIVER"]);

// Fixed (non-random) confetti pieces for the winner screen — deterministic so
// there's no hydration mismatch and it stays cheap. Purely decorative; the
// global reduced-motion rule hides them. Colors map to the brand palette.
const CONFETTI_COLORS = ["var(--gold)", "var(--primary)", "var(--accent)", "#ffffff"];
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37 + 5) % 100,
  delay: (i % 10) * 0.32,
  duration: 2.8 + (i % 5) * 0.5,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
}));

const OUTCOME_AR: Record<string, string> = {
  WIN: "فائز",
  SPLIT: "تقاسم",
  LOSE: "خاسر",
  FOLD: "منسحب",
  REFUND: "استُردّ",
};

/** "Players power" — the integer sum of the combination cards' fame scores, each
 *  rounded exactly as shown on the card (★), so the total reconciles with the
 *  cards and never shows a fraction. */
function combinationPower(cards: { fameScore: number | null }[] | null | undefined): number {
  return (cards ?? []).reduce((sum, c) => sum + Math.round(c.fameScore ?? 0), 0);
}

/** Players-power pill: the ★ icon + the score, no words (the icon IS the label,
 *  matching the cards' fame ★ badge). */
function ScorePill({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/[0.06] px-2 py-0.5 text-xs font-bold text-gold/90">
      <span aria-hidden className="opacity-80">★</span>
      <span className="num font-black">{score}</span>
    </span>
  );
}

/** A stacked-chips glyph — the visual idea of "a pot". Invented to pair with the
 *  ★ score icon; takes `currentColor` so the pill controls its tint. */
function PotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <ellipse cx="8" cy="4.6" rx="5.2" ry="2.1" opacity="0.55" />
      <ellipse cx="8" cy="8" rx="5.2" ry="2.1" opacity="0.78" />
      <ellipse cx="8" cy="11.4" rx="5.2" ry="2.1" />
    </svg>
  );
}

/** Pot pill: the pot icon + its number (potIndex 0 → "1" = main pot), optionally
 *  with the amount won from it. Replaces the wordy "المجمّع الرئيسي / جانبي N"
 *  labels with a compact icon, mirroring the ★ score pill. */
function PotChip({ index, amount }: { index: number; amount?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/[0.06] px-2 py-0.5 text-xs font-bold text-gold/90">
      <PotIcon className="size-3.5 opacity-90" />
      <span className="num font-black">{index + 1}</span>
      {amount != null ? <span className="num text-primary">+{amount}</span> : null}
    </span>
  );
}

/** A compact stat card flanking the player's profile during play: total coins
 *  (gold) on the right, session net profit/loss (emerald up / red down) on the
 *  left. Height-matched to the profile chip; a soft glow adds a little life. */
function StatCard({
  label,
  value,
  tone,
  signed = false,
  glyph,
}: {
  label: string;
  value: number;
  tone: "gold" | "up" | "down";
  signed?: boolean;
  glyph?: string;
}) {
  const tones = {
    gold: "border-gold/45 bg-gold/10 text-gold shadow-[0_0_12px_rgba(212,175,55,0.22)]",
    up: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.3)]",
    down: "border-destructive/50 bg-destructive/10 text-destructive shadow-[0_0_12px_rgba(239,68,68,0.25)]",
  } as const;
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  return (
    <div
      className={cn(
        "flex min-w-[4.25rem] flex-col items-center justify-center rounded-2xl border px-2.5 py-1 backdrop-blur transition sm:min-w-[5.25rem] sm:px-3 sm:py-1.5",
        tones[tone],
      )}
    >
      <span className="text-[0.55rem] font-bold tracking-wide opacity-75 sm:text-[0.64rem]">
        {label}
      </span>
      <span className="num flex items-center gap-1 text-sm font-black leading-none sm:text-lg">
        {glyph ? (
          <span aria-hidden className="text-[0.8em] opacity-90">
            {glyph}
          </span>
        ) : null}
        {sign}
        {Math.abs(value)}
      </span>
    </div>
  );
}

export function GameTable({
  token,
  inviteCode,
  isHost,
  initialBalance,
  nickname,
}: {
  token: string;
  inviteCode: string;
  isHost: boolean;
  initialBalance: number;
  /** The local player's display name (nickname → username), shown at their seat. */
  nickname: string;
}) {
  const { view, start, ready, closeTable, leave, placeAction, clearError } =
    useGameSocket(token, inviteCode);
  const router = useRouter();
  const s = view.state;
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Once the player leaves or the table closes, show the end-of-session table
  // summary (every completed round) instead of navigating away immediately.
  const [showSummary, setShowSummary] = useState(false);
  // Opponent profile open during play (by playerNumber) — on-demand read.
  const [profileNum, setProfileNum] = useState<number | null>(null);

  const players = useMemo(
    () => (s ? [...s.players].sort((a, b) => a.seat - b.seat) : []),
    [s],
  );
  const yourSeat = s?.yourSeat ?? null;
  const me = yourSeat != null ? players.find((p) => p.seat === yourSeat) : undefined;
  const opponents = players.filter((p) => p.seat !== yourSeat);
  // Host authority is LIVE: it follows the server's hostSeat (which transfers if
  // the creator exits without closing), falling back to the initial DB value
  // until the first state:sync arrives.
  const amHost = s?.hostSeat != null ? s.hostSeat === yourSeat : isHost;
  // Leave the table (host role transfers server-side if we're host), then return
  // to the menu. Disconnect on unmount is a backstop if the emit doesn't flush.
  const onExit = () => {
    leave();
    // Show the table summary if there's at least one completed round to browse;
    // otherwise there's nothing to show, so go straight home.
    if (view.rounds.length > 0) setShowSummary(true);
    else router.replace("/");
  };

  const phase = s?.phase ?? "LOBBY";
  const isBetting = BETTING_PHASES.has(phase);
  // A hand is actually live (so leaving now has consequences) when we're past the
  // lobby, the hand hasn't ended, and no result overlay is up.
  const handInProgress = phase !== "LOBBY" && phase !== "ENDED" && !view.result;
  // Whose-turn / contender derived from the shared, unit-tested selectors so the
  // seat-1/host case can't silently regress (PROBLEM 1).
  const isMyTurn = selIsMyTurn(view);
  const owed = s && me ? s.currentBet - me.committedThisRound : 0;
  const minRaiseTo = (s?.currentBet ?? 0) + DEFAULT_GAME_CONFIG.minRaise;

  // Display-only balance. Across a multi-hand session (feature #7) the base is
  // the last resolved hand's authoritative finalBalance (view.balance); during a
  // live hand we subtract what's committed. The server is always the real source.
  const base = view.balance ?? initialBalance;
  const shownBalance = view.result ? base : base - Number(me?.committedTotal ?? 0);
  // Session profit/loss vs the balance the player sat down with — live (dips while
  // chips are committed, recovers on a win), so it tracks the action in real time.
  const net = shownBalance - initialBalance;
  // Cap for the manual raise input: the most you could put in this round = your
  // remaining balance plus what you've already committed this round (i.e. your
  // all-in total). A raise-to can never exceed this.
  const maxRaiseTo = shownBalance + Number(me?.committedThisRound ?? 0);

  // Preload the sound clips once, and unlock audio on the first user gesture
  // (browser autoplay policy: the AudioContext starts suspended). Entering a
  // table needs clicks anyway, so audio is ready before the first hand.
  useEffect(() => {
    void sound.preload();
    const unlock = () => sound.unlock();
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // The room was closed (host or auto-empty). If there are completed rounds to
  // browse, show the table summary (X → home). Otherwise briefly show why, then
  // return to the menu. The server already evicted us and settled any refunds.
  useEffect(() => {
    if (!view.closed) return;
    if (view.rounds.length > 0) {
      setShowSummary(true);
      return;
    }
    const t = setTimeout(() => router.replace("/"), 1400);
    return () => clearTimeout(t);
  }, [view.closed, view.rounds.length, router]);
  // Inactivity auto-logout (or an invalid token) rejected the handshake: the
  // session is gone, so re-authenticate. The web cookie has expired in the same
  // 2-day window, so /login won't bounce back to the table.
  useEffect(() => {
    if (!view.authExpired) return;
    router.replace("/login");
  }, [view.authExpired, router]);

  return (
    <MotionConfig reducedMotion="user">
    <FxProvider>
    {anim("streetFlourish") ? <StreetFlourish phase={phase} /> : null}
    {/* Mobile: a fixed 100dvh flex column (no page scroll during a hand) with the
        header pinned top, the play area flexing, and the action bar pinned bottom;
        safe-area insets keep clear of the notch / home indicator. Desktop keeps
        the original scrollable, centered layout via sm: breakpoints. */}
    <main className="mx-auto flex h-[100dvh] max-w-5xl flex-col overflow-hidden px-3 pt-[max(0.6rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:h-auto sm:min-h-screen sm:overflow-visible sm:px-6 sm:py-6">
      {/* ---------------------------------------------------------- top bar
          During play this stays minimal: ONLY mute, host-only Close Table, and
          Exit. The logo, room name, phase chip and coins were removed to
          declutter (the player's balance still shows at their own seat). Both
          the close and exit confirmations are preserved. */}
      <header className="mb-2 flex shrink-0 items-center justify-end gap-2 sm:mb-4">
        <SoundControl />
        {/* Host-only Close Table (two-step confirm): ends any live hand,
            refunds bets, evicts everyone, deletes the room. */}
        {amHost ? (
          confirmClose ? (
            <span className="flex items-center gap-1">
              <Button variant="destructive" size="sm" onClick={() => closeTable()}>
                تأكيد الإغلاق
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)}>
                إلغاء
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmClose(true)}
            >
              إغلاق الطاولة
            </Button>
          )
        ) : null}
        {/* Leave the table — confirm first (mirrors the close-table flow). The
            contextual consequence is shown in the banner just below. */}
        {confirmLeave ? (
          <ConfirmButtons
            confirmLabel="تأكيد المغادرة"
            onConfirm={onExit}
            onCancel={() => setConfirmLeave(false)}
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmLeave(true)}>
            خروج
          </Button>
        )}
      </header>

      {confirmLeave ? (
        <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive-foreground sm:text-sm">
          {handInProgress
            ? "إذا غادرت الآن ستترك يدك الحالية، وتبقى رهاناتك ضمن المجمّع (لا تُسترد)، ويُسقَط مقعدك من اليد التالية."
            : "هل تريد مغادرة الطاولة والعودة إلى القائمة؟"}
        </p>
      ) : null}

      {!s ? (
        <div className="grid flex-1 place-items-center text-muted-foreground">
          <span className="animate-pulse">جارٍ الاتصال بالطاولة…</span>
        </div>
      ) : (
        <>
          {/* Play area — flexes to fill the space between the pinned header and
              action bar on mobile; normal flow on desktop. */}
          <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto sm:flex-none sm:gap-0 sm:overflow-visible">
          {/* opponents ring — a gentle top ARC hugging the felt's OUTER rim
              (outside the green, overlapping the edge via the negative margin).
              A subtle per-seat translateY makes the row read as players seated
              around the far edge of the table, so the felt is freed for play. */}
          <div className="relative z-10 -mb-5 flex w-full max-w-3xl flex-nowrap items-end justify-center gap-1 px-1 sm:-mb-7 sm:gap-3">
            {opponents.length === 0 ? (
              <span className="mb-5 rounded-full border border-white/10 bg-[#070b14]/70 px-3 py-1.5 text-xs text-white/50 sm:mb-7">
                بانتظار لاعبين آخرين…
              </span>
            ) : (
              opponents.map((p, i) => {
                const n = opponents.length;
                // Distance from the row center → a small downward offset, so the
                // middle seats sit highest (top of the arc) and the edges dip
                // toward the felt's upper corners.
                const offset = Math.round(Math.abs(i - (n - 1) / 2) * 6);
                return (
                  <div key={p.seat} style={{ transform: `translateY(${offset}px)` }}>
                    <OpponentSeat
                      player={p}
                      isActive={s.currentTurnSeat === p.seat}
                      deadlineTs={s.currentTurnSeat === p.seat ? s.turnDeadlineTs : null}
                      onOpenProfile={setProfileNum}
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* ------------------------------------------------ table felt: now
              holds all 7 cards (board + your hole), the pot, in-felt toasts and
              the play animations. Flexes to fill the freed vertical space. */}
          <section
            className="felt relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] border border-primary/15 px-3 pb-3 pt-8 sm:flex-none sm:justify-start sm:gap-5 sm:rounded-[44px] sm:px-8 sm:pb-9 sm:pt-12"
            style={{ boxShadow: "inset 0 0 0 1px rgba(46,230,166,0.06), inset 0 0 70px rgba(0,0,0,0.5), 0 18px 50px rgba(0,0,0,0.5)" }}
          >
            {/* Pitch markings — the felt reads as a football pitch (decorative,
                static, zero perf cost). */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]">
              <div className="absolute inset-3 rounded-[36px] border-2 border-white" />
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white" />
              <div className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white sm:size-36" />
              <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </div>
            {/* Stadium floodlight rim along the top edge. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: "radial-gradient(60% 100% at 50% 0%, color-mix(in oklch, var(--accent) 22%, transparent), transparent)" }}
            />

            {/* In-felt toasts/notices (your turn, raise, fold…) — feedback now
                lives ON the table instead of a fixed page overlay. */}
            <div className="pointer-events-none absolute inset-x-0 top-8 z-30 flex flex-col items-center gap-1.5 px-3 sm:top-12">
              <AnimatePresence>
                {view.notices.map((n) => (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm shadow-lg backdrop-blur",
                      n.kind === "system"
                        ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-white/15 bg-card/90 text-foreground",
                    )}
                  >
                    {n.text}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* focal point: pot scoreboard + community + timer */}
            <div className="relative flex flex-1 flex-col items-center justify-center gap-2 py-1 sm:gap-4 sm:py-2">
              <motion.div
                key={anim("potCountUp") ? "pot" : s.pot}
                data-fx="pot"
                initial={{ scale: 0.85, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="glow-gold relative flex flex-col items-center gap-0.5 rounded-2xl border border-gold/40 bg-[#0b0f1a]/75 px-7 py-2 shadow-lg backdrop-blur"
              >
                {/* #4 absorb ripple — replays on each pot change */}
                {anim("potCountUp") ? (
                  <motion.span
                    key={s.pot}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-gold/40"
                    initial={{ opacity: 0.5, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.22 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                ) : null}
                <span className="text-[0.58rem] font-bold tracking-[0.25em] text-gold/70">المجمّع</span>
                <span className="num text-3xl font-black leading-none text-gold">
                  {anim("potCountUp") ? <CountUp value={s.pot} /> : s.pot}
                </span>
                {s.currentBet > 0 ? (
                  <span className="text-[0.66rem] text-white/55">
                    الرهان <span className="num">{s.currentBet}</span>
                  </span>
                ) : null}
              </motion.div>

              {/* A4: when an all-in splits the pot, show the layered breakdown. */}
              {s.pots.length > 1 ? (
                <div className="flex flex-wrap justify-center gap-1.5 text-[0.7rem]">
                  {s.pots.map((p, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-gold/30 bg-[#0b0f1a]/50 px-2.5 py-1 text-gold/90"
                      title={`مؤهلون: ${p.eligibleSeats.join("، ") || "—"}`}
                    >
                      {i === 0 ? "المجمّع الرئيسي" : `جانبي ${i}`}: 🪙{" "}
                      <span className="num">{p.amount}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-nowrap justify-center gap-1 sm:gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <FootballCard
                    key={i}
                    index={i}
                    card={s.communityCards[i] ?? null}
                    back={!s.communityCards[i]}
                    reveal="flip"
                    widthClass="w-[58px] sm:w-[118px]"
                  />
                ))}
              </div>

              {/* Hidden on mobile to save height — the active seat's depleting
                  ring (and the action bar's own timer on your turn) convey it. */}
              {isBetting && s.currentTurnSeat != null ? (
                <div className="hidden sm:block">
                  <Countdown deadlineTs={s.turnDeadlineTs} />
                </div>
              ) : null}
            </div>
            {/* your hole cards — INSIDE the felt at your seat, so all 7 cards
                sit on the table. Larger than the board so your two stand out. */}
            <section
              data-fx={yourSeat != null ? `seat-${yourSeat}` : undefined}
              className="relative z-10 flex flex-col items-center gap-1"
            >
              <div className="flex items-center gap-2 text-[0.7rem] text-white/75 sm:text-xs">
                <span>بطاقتاك</span>
                {me?.isDealer ? (
                  anim("dealerButton") ? (
                    <motion.span
                      layoutId="dealer-button"
                      className="grid size-4 place-items-center rounded-full bg-white text-[0.6rem] font-black text-black"
                    >
                      D
                    </motion.span>
                  ) : (
                    <span className="grid size-4 place-items-center rounded-full bg-white text-[0.6rem] font-black text-black">
                      D
                    </span>
                  )
                ) : null}
                {me && me.committedTotal > 0 ? (
                  <span className="text-gold">
                    · رهانك 🪙 <span className="num">{me.committedTotal}</span>
                  </span>
                ) : null}
              </div>
              <div className="flex justify-center gap-2 sm:gap-3">
                {view.hole.length > 0 ? (
                  view.hole.map((c, i) => (
                    <FootballCard key={c.playerId} card={c} index={i} size="lg" reveal="deal" />
                  ))
                ) : (
                  <>
                    <FootballCard back size="lg" />
                    <FootballCard back size="lg" />
                  </>
                )}
              </div>
            </section>
          </section>

          {/* your seat HUD — a flanked trio pulled down into the space below the
              felt: total coins (RIGHT), your profile (center), session net P/L
              (LEFT). In RTL the first child renders rightmost. */}
          {me ? (
            <div className="mx-auto mt-1.5 flex w-full max-w-3xl shrink-0 items-stretch justify-center gap-2 sm:mt-3">
              {/* total coins — to the RIGHT of the profile */}
              <StatCard label="رصيدي" glyph="🪙" value={shownBalance} tone="gold" />

              {/* profile — center; the player's nickname, no coins */}
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl border bg-[#070b14]/70 px-3 py-1.5 backdrop-blur transition",
                  isMyTurn ? "border-primary/50 glow-primary" : "border-white/10",
                )}
              >
                <SeatAvatar
                  playerNumber={me.playerNumber}
                  seed={me.username}
                  size={34}
                  sizeClass="size-9 sm:size-10"
                  className={cn("ring-1", isMyTurn ? "ring-2 ring-primary" : "ring-white/15")}
                />
                <div className="flex flex-col leading-tight">
                  <span className="max-w-[7rem] truncate text-xs font-bold sm:max-w-[10rem] sm:text-sm">
                    {nickname}
                  </span>
                  {isMyTurn ? (
                    <span className="text-[0.62rem] font-bold text-primary sm:text-xs">دورك…</span>
                  ) : null}
                </div>
              </div>

              {/* session net profit/loss — to the LEFT of the profile */}
              <StatCard
                label="صافي"
                glyph={net > 0 ? "▲" : net < 0 ? "▼" : undefined}
                value={net}
                signed
                tone={net >= 0 ? "up" : "down"}
              />
            </div>
          ) : null}
          </div>

          {/* ------------------------------------------------- action zone */}
          <div className="mx-auto mt-2 w-full max-w-3xl shrink-0 sm:sticky sm:bottom-2 sm:z-20 sm:mt-5">
            <div className="rounded-2xl border bg-card/85 p-2 shadow-2xl backdrop-blur sm:p-4">
              {phase === "LOBBY" ? (
                <div className="flex flex-col gap-3">
                  {view.waiting ? (
                    <p className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-center text-sm text-gold">
                      بانتظار انضمام لاعبين (أو إعادة شحن الرصيد) لبدء جولة جديدة…
                    </p>
                  ) : null}
                  <LobbyPanel
                    inviteCode={inviteCode}
                    isHost={isHost}
                    canStart={players.length >= 2}
                    onStart={start}
                  />
                </div>
              ) : isMyTurn ? (
                <ActionBar
                  owed={owed}
                  minRaiseTo={minRaiseTo}
                  maxRaiseTo={maxRaiseTo}
                  foldForfeit={view.foldForfeit}
                  onAction={placeAction}
                  deadlineTs={s.turnDeadlineTs}
                />
              ) : view.result ? (
                // The rich breakdown lives in the full-screen ResultOverlay
                // (below); this underlying slot just holds a calm placeholder.
                <p className="py-1 text-center text-sm text-muted-foreground">
                  انتهت الجولة — النتيجة معروضة.
                </p>
              ) : (
                <WaitingHint
                  phase={phase}
                  turnName={
                    s.currentTurnSeat != null
                      ? players.find((p) => p.seat === s.currentTurnSeat)?.username ?? null
                      : null
                  }
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Dedicated full-screen result page: rich, data-driven breakdown that
          stays until the host deals the next hand (no auto-dismiss). */}
      <AnimatePresence>
        {view.result && !showSummary ? (
          <ResultOverlay
            results={view.result.results}
            players={players}
            yourSeat={yourSeat}
            bestRank={view.bestRank}
            isHost={amHost}
            roundReady={view.roundReady}
            onReady={ready}
            onCloseTable={closeTable}
            onExit={onExit}
          />
        ) : null}
      </AnimatePresence>

      {/* Opponent profile (tap a seat). On-demand read; never reveals cards. */}
      <AnimatePresence>
        {profileNum != null ? (
          <OpponentProfileModal playerNumber={profileNum} onClose={() => setProfileNum(null)} />
        ) : null}
      </AnimatePresence>

      {/* A6 + C10 notices (actions, opponent left, reconnect) now render INSIDE
          the felt (see the table section above) so feedback lives on the table. */}

      <AnimatePresence>
        {view.error ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={clearError}
            className="fixed inset-x-0 bottom-24 mx-auto w-fit cursor-pointer rounded-lg border border-destructive bg-card px-4 py-2 text-sm text-destructive-foreground shadow-xl"
            role="alert"
          >
            {view.error}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Room closed with no rounds to browse: explain briefly, then redirect.
          (With completed rounds, the table summary below takes over instead.) */}
      <AnimatePresence>
        {view.closed && !showSummary ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-background/90 px-6 text-center backdrop-blur"
          >
            <div className="flex flex-col items-center gap-2">
              <p className="text-xl font-black">
                {view.closed === "CLOSED_BY_HOST" ? "أغلق المضيف الطاولة" : "أُغلقت الطاولة"}
              </p>
              <p className="text-sm text-muted-foreground">
                تمت إعادة أي رهانات نشطة إلى رصيدك — يتم إرجاعك إلى القائمة…
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Table summary: a collapsed card per completed round, expanding to that
          round's full winner announcement. X closes to home. */}
      <AnimatePresence>
        {showSummary ? (
          <TableSummary
            rounds={view.rounds}
            closedReason={view.closed}
            onClose={() => router.replace("/")}
          />
        ) : null}
      </AnimatePresence>
    </main>
    </FxProvider>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------- sub-panels

function LobbyPanel({
  inviteCode,
  isHost,
  canStart,
  onStart,
}: {
  inviteCode: string;
  isHost: boolean;
  canStart: boolean;
  onStart: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Share the invite via the native share sheet on mobile (Web Share API). The
  // current page URL (/table/<gameId>) joins the room directly. Desktop browsers
  // without Web Share fall back to copying the link to the clipboard.
  const onShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "دعوة إلى طاولة",
          text: `انضم إلى طاولتي! كود الدعوة: ${inviteCode}`,
          url,
        });
      } catch {
        // User dismissed the share sheet, or sharing failed — nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable/blocked — nothing to do.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">كود الدعوة</span>
        <div className="flex items-center gap-2">
          <code className="num rounded-md border bg-secondary/50 px-3 py-1 tracking-widest">
            {inviteCode}
          </code>
          <Button type="button" variant="secondary" size="sm" onClick={onShare} className="gap-1.5">
            <span aria-hidden>🔗</span>
            {copied ? "تم النسخ" : "مشاركة"}
          </Button>
        </div>
      </div>
      {isHost ? (
        <Button onClick={onStart} disabled={!canStart} className="w-full" size="lg">
          {canStart ? "ابدأ اللعبة" : "بانتظار لاعب آخر…"}
        </Button>
      ) : (
        <p className="text-center text-sm text-muted-foreground">بانتظار أن يبدأ المضيف اللعبة…</p>
      )}
    </div>
  );
}

function ActionBar({
  owed,
  minRaiseTo,
  maxRaiseTo,
  foldForfeit,
  onAction,
  deadlineTs,
}: {
  owed: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  /** Coins the player would lose (forfeit) by folding now; rest is refunded. */
  foldForfeit: number;
  onAction: (type: string, amount?: number) => void;
  deadlineTs: number | null;
}) {
  // Fold needs a confirm step. The turn timer is server-authoritative, so it
  // keeps running while this is open (the countdown stays visible above). This
  // component only mounts on your turn, so the confirm self-resets when the turn
  // passes — a stale confirm can never fire a late action.
  const [foldConfirm, setFoldConfirm] = useState(false);
  // Manual raise amount — EMPTY by default (no pre-fill). Kept as a digits-only
  // string so the field can be blank; the component remounts each turn, so it
  // resets to empty every turn. A raise is only allowed when the value is a
  // valid number within [minRaiseTo, maxRaiseTo].
  const [raiseStr, setRaiseStr] = useState("");
  const raiseNum = raiseStr === "" ? NaN : Number(raiseStr);
  const raiseValid =
    Number.isFinite(raiseNum) && raiseNum >= minRaiseTo && raiseNum <= maxRaiseTo;
  // #9 entrance + tap feedback (visual-only; off → no entrance, no tap scale).
  const tap = anim("actionBar") ? "transition-transform active:scale-95" : "";
  // Compact controls on mobile (shorter/tighter), full size on desktop (sm:).
  const sz = "h-8 px-2 text-xs sm:h-9 sm:px-4 sm:text-sm";
  return (
    <motion.div
      initial={anim("actionBar") ? { opacity: 0, y: 16 } : false}
      animate={anim("actionBar") ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex flex-col gap-1.5 sm:gap-3"
    >
      <div className="flex items-center justify-between text-xs sm:text-sm">
        <span className="font-bold text-primary">دورك</span>
        {owed > 0 ? (
          <span className="text-muted-foreground">
            للمساواة: 🪙 <span className="num font-semibold text-foreground">{owed}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">لا رهان مستحق</span>
        )}
      </div>

      <Countdown deadlineTs={deadlineTs} />

      {foldConfirm ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive-foreground sm:text-sm">
            هل تريد الانسحاب؟ ستخسر 🪙 <span className="num font-bold">{foldForfeit}</span>{" "}
            عملة ويُعاد لك باقي رهانك. المؤقّت مستمر.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="destructive" className={sz} onClick={() => onAction("FOLD")}>
              تأكيد الانسحاب
            </Button>
            <Button variant="ghost" className={sz} onClick={() => setFoldConfirm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {owed <= 0 ? (
              <Button variant="secondary" className={cn(tap, sz)} onClick={() => onAction("CHECK")}>
                تمرير
              </Button>
            ) : (
              <Button
                onClick={() => onAction("CALL")}
                className={cn("bg-accent text-accent-foreground hover:bg-accent/90", tap, sz)}
              >
                مساواة <span className="num">{owed}</span>
              </Button>
            )}
            <Button variant="secondary" className={cn(tap, sz)} onClick={() => onAction("ALLIN")}>
              كل الرصيد
            </Button>
            <Button variant="destructive" className={cn(tap, sz)} onClick={() => setFoldConfirm(true)}>
              انسحاب
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              // Digits-only + numeric mobile keypad. type=text (not number) so we
              // fully control the value: strip non-digits and cap at the balance.
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={raiseStr}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                // Empty stays empty; otherwise cap at the max (can't exceed balance).
                setRaiseStr(digits === "" ? "" : String(Math.min(Number(digits), maxRaiseTo)));
              }}
              placeholder={`الحد الأدنى ${minRaiseTo}`}
              className="num h-8 sm:h-9"
              aria-label="مبلغ الرفع"
            />
            <Button
              onClick={() => onAction("RAISE", raiseNum)}
              disabled={!raiseValid}
              className={cn("shrink-0", tap, sz)}
            >
              رفع{raiseValid ? <> إلى <span className="num">{raiseNum}</span></> : null}
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ----------------------------------------------------------- result page

/** Renders the data-driven WHY behind one claimed association: the rank name,
 *  then each evidence group ("ميسي ودي ماريا (نفس الجنسية: الأرجنتين)") joined
 *  by "+". All Arabic text and values come from the server payload (DB/engine);
 *  the client only lays them out. */
function ClaimExplanation({
  rankNameAr,
  groups,
}: {
  rankNameAr: string | null;
  groups: ClaimEvidenceGroup[] | null;
}) {
  if (!groups || groups.length === 0) {
    return rankNameAr ? (
      <span className="font-bold text-gold">{rankNameAr}</span>
    ) : null;
  }
  return (
    <div className="leading-relaxed">
      {rankNameAr ? <span className="font-bold text-gold">{rankNameAr}: </span> : null}
      {groups.map((g, i) => (
        <span key={i}>
          {i > 0 ? <span className="text-muted-foreground"> + </span> : null}
          <span className="font-semibold text-foreground">
            {g.players.map((p) => p.nameAr ?? p.nameEn).join(" و ")}
          </span>{" "}
          <span className="text-muted-foreground">
            ({g.attributeLabelAr}: {g.value})
          </span>
        </span>
      ))}
    </div>
  );
}

/** Full-screen, dedicated result page shown after a hand ends. Reveals the
 *  winner first, then the losers; stays up until the host deals the next hand. */
function ResultOverlay({
  results,
  players,
  yourSeat,
  bestRank,
  isHost,
  roundReady,
  onReady,
  onCloseTable,
  onExit,
}: {
  results: GameResultEntry[];
  players: PlayerView[];
  yourSeat: number | null;
  bestRank: BestRankPayload | null;
  isHost: boolean;
  roundReady: { readySeats: number[]; total: number; deadlineTs: number | null } | null;
  onReady: () => void;
  onCloseTable: () => void;
  onExit: () => void;
}) {
  const { fly } = useFx();
  // Winner-screen ready state (server-authoritative): has THIS player pressed
  // "New Round"? The next hand starts at all-ready or when the grace elapses.
  const youReady = yourSeat != null && (roundReady?.readySeats.includes(yourSeat) ?? false);
  const readyCount = roundReady?.readySeats.length ?? 0;
  const readyTotal = roundReady?.total ?? 0;

  // Celebrated winners (won the combination AND net money) — recomputed here only
  // to gate the confetti + coin-fly. The announcement body itself is rendered by
  // <RoundAnnouncement>, which derives its own celebrated/others/slate sections.
  const celebrated = results.filter(
    (r) => (r.outcome === "WIN" || r.outcome === "SPLIT") && r.coinsDelta > 0,
  );

  // #6 coin payout — fly coins from the (still-mounted) pot up to each celebrated
  // winner's amount once the overlay settles. Decorative; the real +amount already
  // shows. Skipped automatically when off / reduced-motion (fly no-ops).
  useEffect(() => {
    if (!anim("coinPayout") || celebrated.length === 0) return;
    const t = setTimeout(() => {
      celebrated.forEach((w) =>
        fly({ from: '[data-fx="pot"]', to: `[data-fx="win-${w.seat}"]`, kind: "coin", count: 8 }),
      );
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-background/85 p-3 backdrop-blur-md sm:p-6"
    >
      {/* Celebratory confetti — only when someone is actually celebrated.
          Decorative, pointer-events-none, hidden under prefers-reduced-motion. */}
      {celebrated.length > 0 ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="confetti-pc"
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="relative z-10 my-auto w-full max-w-2xl space-y-3">
        {/* ── Post-round controls — ABOVE the announcement. "New Round" is a
            per-player ready vote: the next hand starts when ALL connected humans
            are ready (bots auto-ready) or when the grace countdown elapses
            (server-authoritative). Host also gets Close Table; everyone Exit. */}
        <div className="space-y-2">
          {roundReady ? (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                الاستعداد للجولة: <span className="num font-bold text-foreground">{readyCount}</span>
                /<span className="num">{readyTotal}</span>
              </span>
              {roundReady.deadlineTs ? (
                <Countdown deadlineTs={roundReady.deadlineTs} totalMs={NEW_ROUND_GRACE_SEC * 1000} />
              ) : null}
            </div>
          ) : null}
          <div className={cn("grid gap-2", isHost ? "grid-cols-3" : "grid-cols-2")}>
            <ResultAction
              glyph={youReady ? "✓" : "▶"}
              label={youReady ? "جاهز" : "جولة جديدة"}
              variant="primary"
              disabled={youReady}
              onClick={onReady}
            />
            {isHost ? (
              <ResultAction glyph="✕" label="اغلاق الطاولة" variant="destructive" onClick={onCloseTable} />
            ) : null}
            <ResultAction glyph="⮐" label="الخروج" variant="neutral" onClick={onExit} />
          </div>
        </div>

        {/* The announcement itself — identical to what the table summary replays. */}
        <RoundAnnouncement
          results={results}
          players={players}
          yourSeat={yourSeat}
          bestRank={bestRank}
        />
      </div>
    </motion.div>
  );
}

/**
 * The winner-announcement body — the exact content shown when a round ends,
 * reused verbatim by the live result overlay AND by each expanded round in the
 * table summary. Pure presentation: the celebrated (gold) winners, the slate
 * "draw" card when no one won, everyone-else (red) cards, and the local player's
 * private best-rank row. No controls/confetti/ready-check (those are live-only).
 */
function RoundAnnouncement({
  results,
  players,
  yourSeat,
  bestRank,
}: {
  results: GameResultEntry[];
  players: PlayerView[];
  yourSeat: number | null;
  bestRank: BestRankPayload | null;
}) {
  // Profile lookup (avatar + name) from the round's player snapshot — no dup data.
  const playerOf = (seat: number) => players.find((p) => p.seat === seat);

  // Celebrated ONLY = won a pot (the combination) AND came out NET-POSITIVE on
  // money. A player can win a pot/combination yet still be a net money loser
  // (e.g. takes a small side pot worth less than they paid in) — they are NOT
  // celebrated; they drop into the list below. Ordered by combination strength
  // (strongest first), then players-power as the tiebreaker — mirrors resolution.
  const celebrated = results
    .filter((r) => (r.outcome === "WIN" || r.outcome === "SPLIT") && r.coinsDelta > 0)
    .sort(
      (a, b) => (b.strength ?? 0) - (a.strength ?? 0) || (b.scoreSum ?? 0) - (a.scoreSum ?? 0),
    );
  // Any pot winner at all? Distinguishes a genuine no-winner refund (slate "draw")
  // from a hand whose pot winners simply weren't net-positive.
  const hasPotWinner = results.some((r) => r.outcome === "WIN" || r.outcome === "SPLIT");
  // Everyone else — pure losers, folders, refunds, and any net-≤0 pot winner —
  // best money result first; rendered as collapsed cards below.
  const others = results
    .filter((r) => !celebrated.includes(r))
    .sort((a, b) => b.coinsDelta - a.coinsDelta);
  // Pots are only called out on the rows when MORE THAN ONE player is celebrated.
  const showPots = celebrated.length > 1;

  return (
    <div className="space-y-3">
      {/* ── TOP celebrated section — ONLY players who won the combination AND the
          money, ordered by hand strength. When there's no pot winner at all → the
          slate "draw" card instead. */}
      {celebrated.length > 0 ? (
        <motion.section
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-card/90 p-4 shadow-2xl"
        >
          <div className="mb-3 flex flex-col items-center">
            <motion.span
              initial={anim("winnerReveal") ? { scale: 0, rotate: -20 } : false}
              animate={anim("winnerReveal") ? { scale: 1, rotate: 0 } : undefined}
              transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.1 }}
              className="glow-gold grid size-12 place-items-center rounded-full border border-gold/50 bg-gold/10 text-2xl"
            >
              🏆
            </motion.span>
            <div className="mt-1 text-xs font-bold tracking-[0.15em] text-gold/80">
              {celebrated.length > 1 ? "الفائزون" : "الفائز"}
            </div>
          </div>
          <div className="space-y-2">
            {celebrated.map((w) => (
              <PlayerResultCard
                key={w.seat}
                r={w}
                you={w.seat === yourSeat}
                player={playerOf(w.seat)}
                tone="gold"
                showPots={showPots}
                defaultOpen
              />
            ))}
          </div>
        </motion.section>
      ) : !hasPotWinner ? (
        <motion.section
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="rounded-2xl border border-slate-400/40 bg-gradient-to-b from-slate-400/15 to-card/90 p-5 text-center shadow-2xl"
        >
          <div className="mb-1 flex justify-center">
            <span className="grid size-12 place-items-center rounded-full border border-slate-300/40 bg-slate-400/10 text-2xl">
              🤝
            </span>
          </div>
          <div className="text-3xl font-black tracking-wide text-slate-200">تعادل!</div>
          <p className="mt-1 text-sm text-muted-foreground">لا فائز — استُردّت المساهمات.</p>
          {/* All players side by side. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {players.map((pl) => (
              <div key={pl.seat} className="flex w-[64px] flex-col items-center gap-1">
                <SeatAvatar
                  playerNumber={pl.playerNumber}
                  seed={pl.username}
                  size={44}
                  className="ring-1 ring-slate-300/30"
                />
                <span className="max-w-full truncate text-[0.68rem] text-muted-foreground">
                  {pl.seat === yourSeat ? "أنت" : pl.username}
                </span>
              </div>
            ))}
          </div>
        </motion.section>
      ) : null}

      {/* ── Everyone else: collapsed cards (key info on the outside), tap to
          expand for the cards + the settlement math. Same card as above. */}
      {others.length > 0 ? (
        <div className="space-y-1.5">
          {others.map((r) => (
            <PlayerResultCard
              key={r.seat}
              r={r}
              you={r.seat === yourSeat}
              player={playerOf(r.seat)}
              tone="red"
              showPots={false}
              defaultOpen={false}
            />
          ))}
        </div>
      ) : null}

      {/* Your own strongest combination — private reveal, tap to expand. */}
      {bestRank ? <BestRankRow bestRank={bestRank} /> : null}
    </div>
  );
}

/** End-of-session table summary, shown to a player who left or when the table
 *  closed: one collapsed card per completed round (round number only on the
 *  face), each expanding to that round's full winner announcement. The X button
 *  closes to the home page. Rounds are oldest-first. */
function TableSummary({
  rounds,
  closedReason,
  onClose,
}: {
  rounds: RoundSummary[];
  closedReason: "CLOSED_BY_HOST" | "EMPTY" | null;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-background/90 p-3 backdrop-blur-md sm:p-6"
    >
      <div className="relative z-10 my-auto w-full max-w-2xl space-y-3">
        {/* header: title + reason + X (→ home) */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-card/85 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 flex-col">
            <span className="text-base font-black sm:text-lg">ملخص الطاولة</span>
            <span className="truncate text-[0.7rem] text-muted-foreground sm:text-xs">
              {closedReason === "CLOSED_BY_HOST"
                ? "أغلق المضيف الطاولة"
                : closedReason === "EMPTY"
                  ? "أُغلقت الطاولة"
                  : `استعرض جولاتك — ${rounds.length} ${rounds.length === 1 ? "جولة" : "جولات"}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق والعودة للرئيسية"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-black/40 text-lg text-white/85 transition hover:bg-black/65 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* one collapsed card per completed round (oldest first) */}
        <div className="space-y-2">
          {rounds.map((rd) => (
            <SummaryRoundCard key={rd.round} rd={rd} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** A single round in the table summary: collapsed shows just "الجولة N"; tapping
 *  expands to replay that round's winner announcement exactly as it appeared. */
function SummaryRoundCard({ rd }: { rd: RoundSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/12 bg-card/70 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <span className="num grid size-8 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 text-xs font-black text-gold">
          {rd.round}
        </span>
        <span className="flex-1 text-sm font-bold">الجولة {rd.round}</span>
        <span
          aria-hidden
          className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 p-3">
          <RoundAnnouncement
            results={rd.result.results}
            players={rd.players}
            yourSeat={rd.yourSeat}
            bestRank={rd.bestRank}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The expanded money math: which pot(s) were won (icon + amount), then the
 *  paid → won → net line. Shown when a card is expanded. */
function MoneyMath({ r }: { r: GameResultEntry }) {
  const grossWon = r.potsWon.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="w-full max-w-xs rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
      {/* Per-pot breakdown only when this player won MORE THAN ONE pot — a single
          pot needs no label (the "ربح" total below already states it). */}
      {r.potsWon.length > 1 ? (
        <div className="mb-1.5 flex flex-wrap justify-center gap-1.5">
          {r.potsWon.map((p) => (
            <PotChip key={p.potIndex} index={p.potIndex} amount={p.amount} />
          ))}
        </div>
      ) : null}
      <div className="num flex items-center justify-center gap-2">
        <span className="text-muted-foreground">
          دفع <b className="text-foreground">{r.contributed}</b>
        </span>
        <span aria-hidden className="text-muted-foreground/50">•</span>
        <span className="text-muted-foreground">
          ربح <b className="text-primary">{grossWon}</b>
        </span>
        <span aria-hidden className="text-muted-foreground/50">•</span>
        <span className="text-muted-foreground">
          صافي{" "}
          <b className={r.coinsDelta >= 0 ? "text-primary" : "text-destructive"}>
            {r.coinsDelta >= 0 ? "+" : ""}
            {r.coinsDelta}
          </b>
        </span>
      </div>
    </div>
  );
}

/** One consistent player card for BOTH the celebrated (gold) and the everyone-else
 *  (red) sections — only the tone, default-open state, and pot-icon display differ.
 *  Collapsed: avatar · name · association · ★score · (pots) · net amount. Expanded:
 *  the combination cards, the settlement math, and the data-driven "why". */
function PlayerResultCard({
  r,
  you,
  player,
  tone,
  showPots,
  defaultOpen,
}: {
  r: GameResultEntry;
  you: boolean;
  player: PlayerView | undefined;
  tone: "gold" | "red";
  showPots: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const gold = tone === "gold";
  // Only the cards forming this player's strongest combination (engine witness) —
  // never the full 7.
  const cards = r.combinationCards && r.combinationCards.length > 0 ? r.combinationCards : null;
  const power = combinationPower(r.combinationCards);
  const hasDetails =
    Boolean(cards) || Boolean(r.claimEvidence) || r.potsWon.length > 0 || r.contributed > 0;
  const name = you ? "أنت" : player?.username ?? `مقعد ${r.seat}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border",
        gold
          ? you
            ? "border-gold/55 bg-gold/[0.12]"
            : "border-gold/35 bg-gold/[0.06]"
          : you
            ? "border-destructive/45 bg-destructive/10"
            : "border-destructive/25 bg-destructive/[0.05]",
      )}
    >
      {/* collapsed: avatar — [name (+outcome) / association · ★score · pots] — amount */}
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        disabled={!hasDetails}
        className="flex w-full items-center gap-2.5 p-2.5 text-start disabled:cursor-default"
      >
        {player ? (
          <SeatAvatar
            playerNumber={player.playerNumber}
            seed={player.username}
            size={gold ? 44 : 38}
            className={cn("shrink-0 ring-2", gold ? "glow-gold ring-gold/50" : "ring-destructive/25")}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate font-bold",
                gold && anim("winnerReveal") && "badge-shine rounded px-1",
              )}
            >
              {name}
            </span>
            {!gold ? (
              <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[0.62rem] text-destructive">
                {OUTCOME_AR[r.outcome] ?? r.outcome}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {r.claimedRankNameAr ? (
              <span className={cn("text-xs font-black", gold ? "text-gold" : "text-gold/80")}>
                {r.claimedRankNameAr}
              </span>
            ) : null}
            {cards ? <ScorePill score={power} /> : null}
            {showPots
              ? r.potsWon.map((p) => <PotChip key={p.potIndex} index={p.potIndex} />)
              : null}
          </div>
        </div>
        <span
          data-fx={gold ? `win-${r.seat}` : undefined}
          className={cn(
            "num shrink-0 text-base font-extrabold",
            gold && "rounded-full bg-primary/15 px-2.5 py-0.5",
            r.coinsDelta > 0
              ? "text-primary"
              : r.coinsDelta < 0
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {r.coinsDelta >= 0 ? "+" : ""}
          {r.coinsDelta}
        </span>
        {hasDetails ? (
          <span
            aria-hidden
            className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          >
            ▾
          </span>
        ) : null}
      </button>
      {/* expanded: the combination cards, the settlement math, then the "why" */}
      {open && hasDetails ? (
        <div
          className={cn(
            "flex flex-col items-center gap-2.5 border-t p-3 text-center",
            gold ? "border-gold/15" : "border-destructive/15",
          )}
        >
          {cards ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {cards.map((c, i) => (
                <FootballCard
                  key={`${r.seat}-${c.playerId}-${i}`}
                  card={c}
                  index={i}
                  variant="result"
                  reveal={gold ? "flip" : undefined}
                />
              ))}
            </div>
          ) : r.claimedRankNameAr ? null : (
            <div className="text-xs text-muted-foreground">بدون ترابط</div>
          )}
          <MoneyMath r={r} />
          {r.claimEvidence ? (
            <div className="mx-auto max-w-md text-[0.7rem] text-muted-foreground">
              <ClaimExplanation rankNameAr={null} groups={r.claimEvidence} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Your private strongest combination, collapsed to one row; tap to reveal the
 *  evidence + cards. Always shown to the local player (winner or not). */
function BestRankRow({ bestRank }: { bestRank: BestRankPayload }) {
  const [open, setOpen] = useState(false);
  const has = Boolean(bestRank.rankNameAr);
  return (
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5">
      <button
        type="button"
        onClick={() => has && setOpen((o) => !o)}
        disabled={!has}
        className="flex w-full items-center gap-2 p-2.5 text-start disabled:cursor-default"
      >
        <span aria-hidden className="text-base">🃏</span>
        <span className="flex-1 text-xs font-bold text-primary">أقوى ترابط لديك</span>
        <span className="truncate text-xs text-gold">{bestRank.rankNameAr ?? "لا ترابط مكتمل"}</span>
        {has ? (
          <span aria-hidden className={cn("text-muted-foreground transition-transform", open && "rotate-180")}>
            ▾
          </span>
        ) : null}
      </button>
      {open && has ? (
        <div className="border-t border-primary/20 p-2.5 text-center">
          <div className="mb-2 text-xs">
            <ClaimExplanation rankNameAr={bestRank.rankNameAr} groups={bestRank.evidence} />
          </div>
          {bestRank.cards.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {bestRank.cards.map((c, i) => (
                <FootballCard key={`best-${c.playerId}-${i}`} card={c} index={i} variant="result" />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A single post-round control: stacked icon + Arabic label, tone by variant. */
function ResultAction({
  glyph,
  label,
  variant,
  onClick,
  disabled,
}: {
  glyph: string;
  label: string;
  variant: "primary" | "destructive" | "neutral";
  onClick: () => void;
  disabled?: boolean;
}) {
  const tone =
    variant === "primary"
      ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
      : variant === "destructive"
        ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
        : "border-white/15 bg-card/70 text-foreground/80 hover:border-white/30";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center transition disabled:opacity-50",
        tone,
      )}
    >
      <span aria-hidden className="text-lg leading-none">
        {glyph}
      </span>
      <span className="text-xs font-bold leading-tight">{label}</span>
    </button>
  );
}

function WaitingHint({ phase, turnName }: { phase: string; turnName: string | null }) {
  return (
    <p className="py-1 text-center text-sm text-muted-foreground">
      {phase === "SHOWDOWN" ? (
        "بانتظار اختيارات اللاعبين…"
      ) : turnName != null ? (
        <>
          الدور على <span className="font-bold text-primary">{turnName}</span>…
        </>
      ) : (
        "بانتظار الجولة…"
      )}
    </p>
  );
}
