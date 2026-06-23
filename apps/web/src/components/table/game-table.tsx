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
import { isMyTurn as selIsMyTurn } from "@/lib/tableView";
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

export function GameTable({
  token,
  inviteCode,
  isHost,
  initialBalance,
}: {
  token: string;
  inviteCode: string;
  isHost: boolean;
  initialBalance: number;
}) {
  const { view, start, ready, closeTable, leave, placeAction, clearError, submitPassword } =
    useGameSocket(token, inviteCode);
  const router = useRouter();
  const s = view.state;
  const [password, setPassword] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
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
    router.replace("/");
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

  // The room was closed (host or auto-empty): briefly show why, then return to
  // the menu. The server already evicted us and settled any refunds.
  useEffect(() => {
    if (!view.closed) return;
    const t = setTimeout(() => router.replace("/"), 1400);
    return () => clearTimeout(t);
  }, [view.closed, router]);
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
            onConfirm={() => router.push("/")}
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
                    widthClass="w-[56px] sm:w-[104px]"
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

          {/* your seat — profile + live balance, pulled down into the space that
              used to be empty below the felt, so nothing floats and the column
              stays balanced between the table and the action bar. */}
          {me ? (
            <div className="mx-auto mt-1.5 flex w-full max-w-3xl shrink-0 items-center justify-center sm:mt-3">
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
                  <span className="text-xs font-bold sm:text-sm">أنت</span>
                  <span className="num text-[0.66rem] text-gold sm:text-xs">🪙 {shownBalance}</span>
                </div>
                {isMyTurn ? (
                  <span className="ms-1 text-[0.62rem] font-bold text-primary sm:text-xs">دورك…</span>
                ) : null}
              </div>
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
        {view.result ? (
          <ResultOverlay
            results={view.result.results}
            winningRankNameAr={view.result.winningRankNameAr}
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

      {/* Locked room: the server demands a password before seating. Prompt for it
          and retry the join; on success a state:sync clears this overlay. */}
      <AnimatePresence>
        {view.needsPassword && !view.closed ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-background/90 px-6 backdrop-blur"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (password.trim()) submitPassword(password.trim());
              }}
              className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 text-center shadow-xl"
            >
              <div className="text-3xl">🔒</div>
              <p className="text-lg font-black">غرفة خاصة</p>
              <p className="text-sm text-muted-foreground">
                {view.passwordMessage ?? "أدخل كلمة المرور للدخول"}
              </p>
              <Input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                className="text-center"
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={!password.trim()} className="flex-1">
                  دخول
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.push("/")}>
                  ← القائمة
                </Button>
              </div>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Room closed (host closed it, or it auto-emptied): explain, then redirect. */}
      <AnimatePresence>
        {view.closed ? (
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
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">كود الدعوة</span>
        <code className="num rounded-md border bg-secondary/50 px-3 py-1 tracking-widest">
          {inviteCode}
        </code>
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
  onAction,
  deadlineTs,
}: {
  owed: number;
  minRaiseTo: number;
  maxRaiseTo: number;
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
            الانسحاب من هذه الجولة؟ تخسر جزءًا من رهانك ويُعاد لك الباقي. المؤقّت مستمر.
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
  winningRankNameAr,
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
  winningRankNameAr: string | null;
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

  const nameOf = (seat: number) =>
    players.find((p) => p.seat === seat)?.username ?? `مقعد ${seat}`;
  // Profile lookup (avatar + name) from the existing player list — no duplicate data.
  const playerOf = (seat: number) => players.find((p) => p.seat === seat);

  const winners = results.filter((r) => r.outcome === "WIN" || r.outcome === "SPLIT");

  // #6 coin payout — fly coins from the (still-mounted) pot up to each winner's
  // payout pill once the overlay has settled. Decorative; the real +amount is
  // already shown. Skipped automatically when off / reduced-motion (fly no-ops).
  useEffect(() => {
    if (!anim("coinPayout") || winners.length === 0) return;
    const t = setTimeout(() => {
      winners.forEach((w) =>
        fly({ from: '[data-fx="pot"]', to: `[data-fx="win-${w.seat}"]`, kind: "coin", count: 8 }),
      );
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const losers = results
    .filter((r) => r.outcome !== "WIN" && r.outcome !== "SPLIT")
    .sort((a, b) => a.coinsDelta - b.coinsDelta);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-background/85 p-3 backdrop-blur-md sm:p-6"
    >
      {/* Celebratory confetti — only when there's actually a winner. Decorative,
          pointer-events-none, hidden under prefers-reduced-motion. */}
      {winners.length > 0 ? (
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

        {/* ── Winner HERO (focal celebration) ──────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-card/90 p-5 text-center shadow-2xl"
        >
          <div className="mb-1 flex justify-center">
            <motion.span
              initial={anim("winnerReveal") ? { scale: 0, rotate: -20 } : false}
              animate={anim("winnerReveal") ? { scale: 1, rotate: 0 } : undefined}
              transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.1 }}
              className="glow-gold grid size-12 place-items-center rounded-full border border-gold/50 bg-gold/10 text-2xl"
            >
              🏆
            </motion.span>
          </div>

          {winners.length === 0 ? (
            <p className="mt-1 text-muted-foreground">لا فائز — استُردّت المساهمات.</p>
          ) : (
            <>
              <div className="text-xs font-bold tracking-[0.15em] text-gold/80">
                {winners.length > 1 ? "الفائزون" : "الفائز"}
              </div>
              {/* winning rank — the headline */}
              {(winningRankNameAr ?? winners[0]!.claimedRankNameAr) ? (
                <div className="mt-0.5 text-2xl font-black text-gold">
                  {winningRankNameAr ?? winners[0]!.claimedRankNameAr}
                </div>
              ) : null}
              {/* EACH winner: avatar + name + payout, then THEIR OWN combination
                  cards + "why". In a split this shows every winner's own cards
                  (previously only the first winner's were shown). Never all 7. */}
              <div className="mt-3 flex flex-col items-center gap-4">
                {winners.map((w) => {
                  const p = playerOf(w.seat);
                  const you = w.seat === yourSeat;
                  return (
                    <div
                      key={w.seat}
                      className={cn(
                        "flex w-full flex-col items-center gap-2",
                        winners.length > 1 && "rounded-2xl border border-gold/20 bg-gold/[0.04] p-3",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {p ? (
                          <SeatAvatar
                            playerNumber={p.playerNumber}
                            seed={p.username}
                            size={46}
                            className="glow-gold ring-2 ring-gold/50"
                          />
                        ) : null}
                        <span
                          className={cn(
                            "text-lg font-extrabold",
                            anim("winnerReveal") && "badge-shine rounded px-1",
                          )}
                        >
                          {you ? "أنت" : p?.username ?? nameOf(w.seat)}
                        </span>
                        <span
                          data-fx={`win-${w.seat}`}
                          className="num rounded-full bg-primary/15 px-2.5 py-0.5 text-base font-extrabold text-primary"
                        >
                          +{w.coinsDelta}
                        </span>
                      </div>
                      {/* this winner's combination score sum (the tiebreaker) */}
                      {w.scoreSum != null ? (
                        <span className="rounded-full border border-gold/30 bg-gold/[0.06] px-2.5 py-0.5 text-[0.7rem] text-gold/90">
                          مجموع النقاط <span className="num font-bold">{w.scoreSum}</span>
                        </span>
                      ) : null}
                      {/* this winner's concise "why" (rank is the headline above) */}
                      {w.claimEvidence ? (
                        <div className="mx-auto max-w-md text-xs text-muted-foreground">
                          <ClaimExplanation rankNameAr={null} groups={w.claimEvidence} />
                        </div>
                      ) : null}
                      {/* this winner's OWN winning-combination cards (never all 7) */}
                      {w.combinationCards && w.combinationCards.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {w.combinationCards.map((c, i) => (
                            <FootballCard
                              key={`${w.seat}-${c.playerId}-${i}`}
                              card={c}
                              index={i}
                              variant="result"
                              reveal="flip"
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </motion.section>

        {/* ── Everyone else: clean tappable profile rows (avatar + name) ────── */}
        {losers.length > 0 ? (
          <div className="space-y-1.5">
            {losers.map((r) => (
              <ResultRow
                key={r.seat}
                r={r}
                you={r.seat === yourSeat}
                player={playerOf(r.seat)}
              />
            ))}
          </div>
        ) : null}

        {/* Your own strongest combination — private reveal, tap to expand. */}
        {bestRank ? <BestRankRow bestRank={bestRank} /> : null}
      </div>
    </motion.div>
  );
}

/** One collapsed profile row for a non-hero player: avatar + name + outcome chip
 *  + rank (claimed in Manual / computed in Auto — same field) + ±amount. Tapping
 *  expands that player's cards + full evidence inline. Presentation only. */
function ResultRow({
  r,
  you,
  player,
}: {
  r: GameResultEntry;
  you: boolean;
  player: PlayerView | undefined;
}) {
  const [open, setOpen] = useState(false);
  // Only the cards forming this player's strongest combination (engine witness) —
  // never the full 7.
  const cards = r.combinationCards && r.combinationCards.length > 0 ? r.combinationCards : null;
  const hasDetails = Boolean(cards) || Boolean(r.claimEvidence) || Boolean(r.claimedRankNameAr);
  const name = you ? "أنت" : player?.username ?? `مقعد ${r.seat}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border",
        you ? "border-primary/30 bg-primary/10" : "border-white/10 bg-card/80",
      )}
    >
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
            size={36}
            className="shrink-0 ring-1 ring-white/15"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold">{name}</span>
            <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[0.62rem] text-muted-foreground">
              {OUTCOME_AR[r.outcome] ?? r.outcome}
            </span>
          </div>
          {/* Every player's strongest combination + its score sum — winner and
              loser alike, including folders. */}
          {r.claimedRankNameAr ? (
            <div className="truncate text-xs">
              <span className="text-gold">{r.claimedRankNameAr}</span>
              {r.scoreSum != null ? (
                <span className="text-muted-foreground">
                  {" "}· النقاط <span className="num">{r.scoreSum}</span>
                </span>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">بدون ترابط</div>
          )}
        </div>
        <span
          className={cn("num shrink-0 font-extrabold", r.coinsDelta >= 0 ? "text-primary" : "text-destructive")}
        >
          {r.coinsDelta >= 0 ? "+" : ""}
          {r.coinsDelta}
        </span>
        {hasDetails ? (
          <span aria-hidden className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}>
            ▾
          </span>
        ) : null}
      </button>
      {open && hasDetails ? (
        <div className="border-t border-white/10 p-2.5 text-center">
          {r.claimEvidence || r.claimedRankNameAr ? (
            <div className="mb-2 text-xs">
              <ClaimExplanation rankNameAr={r.claimedRankNameAr} groups={r.claimEvidence} />
            </div>
          ) : null}
          {cards ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {cards.map((c, i) => (
                <FootballCard key={`${c.playerId}-${i}`} card={c} index={i} variant="result" />
              ))}
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
