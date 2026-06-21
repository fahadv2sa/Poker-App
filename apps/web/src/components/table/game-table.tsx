"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DEFAULT_GAME_CONFIG,
  type BestRankPayload,
  type CardView,
  type ClaimEvidenceGroup,
  type GameResultEntry,
  type PlayerView,
} from "@fp/shared";
import { useGameSocket } from "@/lib/useGameSocket";
import { isContender as selIsContender, isMyTurn as selIsMyTurn } from "@/lib/tableView";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { SoundControl } from "@/components/sound-control";
import { Logo } from "@/components/logo";
import { ConfirmButtons } from "@/components/confirm-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Countdown, FootballCard, OpponentSeat, PHASE_AR } from "./parts";
import { OpponentProfileModal } from "./opponent-profile-modal";

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
  roomName,
  isHost,
  initialBalance,
}: {
  token: string;
  inviteCode: string;
  roomName: string;
  isHost: boolean;
  initialBalance: number;
}) {
  const { view, start, nextHand, closeTable, leave, placeAction, selectClaim, clearError, submitPassword } =
    useGameSocket(token, inviteCode);
  const router = useRouter();
  const s = view.state;
  const [raiseTo, setRaiseTo] = useState(0);
  const [password, setPassword] = useState("");
  const [claimed, setClaimed] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // "Continue Playing" dismisses the result overlay locally for this player; it
  // resets whenever a new result arrives so the next round's winner shows again.
  const [continued, setContinued] = useState(false);
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
  const isContender = selIsContender(view);
  const owed = s && me ? s.currentBet - me.committedThisRound : 0;
  const minRaiseTo = (s?.currentBet ?? 0) + DEFAULT_GAME_CONFIG.minRaise;

  // Display-only balance. Across a multi-hand session (feature #7) the base is
  // the last resolved hand's authoritative finalBalance (view.balance); during a
  // live hand we subtract what's committed. The server is always the real source.
  const base = view.balance ?? initialBalance;
  const shownBalance = view.result ? base : base - Number(me?.committedTotal ?? 0);

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

  useEffect(() => {
    if (isMyTurn) setRaiseTo(minRaiseTo);
  }, [isMyTurn, minRaiseTo]);
  useEffect(() => {
    if (phase !== "SHOWDOWN") setClaimed(null);
  }, [phase]);
  // A new round's result re-shows the winner screen for a player who "continued".
  useEffect(() => {
    setContinued(false);
  }, [view.result]);
  // The room was closed (host or auto-empty): briefly show why, then return to
  // the menu. The server already evicted us and settled any refunds.
  useEffect(() => {
    if (!view.closed) return;
    const t = setTimeout(() => router.replace("/"), 1400);
    return () => clearTimeout(t);
  }, [view.closed, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-3 py-4 sm:px-6 sm:py-6">
      {/* ---------------------------------------------------------- top bar */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Logo className="size-7 shrink-0" />
          <span className="truncate text-lg font-black">{roomName}</span>
          <span className="hidden rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground sm:inline">
            {PHASE_AR[phase] ?? phase}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SoundControl />
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm text-gold">
            🪙 <span className="num font-semibold">{shownBalance}</span>
          </span>
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
        </div>
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
          {/* ------------------------------------------------ table centerpiece */}
          <section
            className="felt relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 overflow-hidden rounded-[44px] border border-primary/15 px-4 py-6 sm:px-8 sm:py-9"
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

            {/* opponents around the rim */}
            <div className="flex w-full flex-wrap items-start justify-center gap-2">
              {opponents.length === 0 ? (
                <span className="py-2 text-sm text-white/50">بانتظار لاعبين آخرين…</span>
              ) : (
                opponents.map((p) => (
                  <OpponentSeat
                    key={p.seat}
                    player={p}
                    isActive={s.currentTurnSeat === p.seat}
                    deadlineTs={s.currentTurnSeat === p.seat ? s.turnDeadlineTs : null}
                    hasClaimed={phase === "SHOWDOWN" && view.claimedSeats.includes(p.seat)}
                    onOpenProfile={setProfileNum}
                  />
                ))
              )}
            </div>

            {/* focal point: pot scoreboard + community + timer */}
            <div className="relative flex flex-1 flex-col items-center justify-center gap-4 py-2">
              <motion.div
                key={s.pot}
                initial={{ scale: 0.85, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="glow-gold flex flex-col items-center gap-0.5 rounded-2xl border border-gold/40 bg-[#0b0f1a]/75 px-7 py-2 shadow-lg backdrop-blur"
              >
                <span className="text-[0.58rem] font-bold tracking-[0.25em] text-gold/70">المجمّع</span>
                <span className="num text-3xl font-black leading-none text-gold">{s.pot}</span>
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

              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <FootballCard
                    key={i}
                    index={i}
                    card={s.communityCards[i] ?? null}
                    back={!s.communityCards[i]}
                  />
                ))}
              </div>

              {isBetting && s.currentTurnSeat != null ? (
                <Countdown deadlineTs={s.turnDeadlineTs} />
              ) : null}
            </div>
          </section>

          {/* ----------------------------------------------- my hole cards */}
          <section className="mx-auto mt-5 flex w-full max-w-3xl flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>بطاقتاك</span>
              {me?.isDealer ? (
                <span className="grid size-4 place-items-center rounded-full bg-white text-[0.6rem] font-black text-black">
                  D
                </span>
              ) : null}
              {me && me.committedTotal > 0 ? (
                <span className="text-gold">
                  · رهانك 🪙 <span className="num">{me.committedTotal}</span>
                </span>
              ) : null}
            </div>
            <div className="flex justify-center gap-3">
              {view.hole.length > 0 ? (
                view.hole.map((c, i) => <FootballCard key={c.playerId} card={c} index={i} size="lg" />)
              ) : (
                <>
                  <FootballCard back size="lg" />
                  <FootballCard back size="lg" />
                </>
              )}
            </div>
          </section>

          {/* ------------------------------------------------- action zone */}
          <div className="sticky bottom-2 z-20 mx-auto mt-5 w-full max-w-3xl">
            <div className="rounded-2xl border bg-card/85 p-4 shadow-2xl backdrop-blur">
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
                  raiseTo={raiseTo}
                  setRaiseTo={setRaiseTo}
                  onAction={placeAction}
                  deadlineTs={s.turnDeadlineTs}
                />
              ) : phase === "SHOWDOWN" && isContender && view.showdown ? (
                <ClaimPanel
                  ranks={view.showdown.availableHandRanks}
                  deadlineTs={view.showdown.deadlineTs}
                  claimed={claimed}
                  onPick={(id) => {
                    setClaimed(id);
                    selectClaim(id);
                  }}
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
        {view.result && !continued ? (
          <ResultOverlay
            results={view.result.results}
            winningRankNameAr={view.result.winningRankNameAr}
            players={players}
            community={(s?.communityCards ?? []).filter((c): c is CardView => c !== null)}
            yourSeat={yourSeat}
            bestRank={view.bestRank}
            isHost={amHost}
            onNextHand={nextHand}
            onCloseTable={closeTable}
            onExit={onExit}
            onContinue={() => setContinued(true)}
          />
        ) : null}
      </AnimatePresence>

      {/* Opponent profile (tap a seat). On-demand read; never reveals cards. */}
      <AnimatePresence>
        {profileNum != null ? (
          <OpponentProfileModal playerNumber={profileNum} onClose={() => setProfileNum(null)} />
        ) : null}
      </AnimatePresence>

      {/* A6 + C10: auto-dismissing notices (actions, opponent left, reconnect). */}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-30 flex flex-col items-center gap-1.5">
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
  raiseTo,
  setRaiseTo,
  onAction,
  deadlineTs,
}: {
  owed: number;
  minRaiseTo: number;
  raiseTo: number;
  setRaiseTo: (n: number) => void;
  onAction: (type: string, amount?: number) => void;
  deadlineTs: number | null;
}) {
  // Fold needs a confirm step. The turn timer is server-authoritative, so it
  // keeps running while this is open (the countdown stays visible above). This
  // component only mounts on your turn, so the confirm self-resets when the turn
  // passes — a stale confirm can never fire a late action.
  const [foldConfirm, setFoldConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
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
            <Button variant="destructive" onClick={() => onAction("FOLD")}>
              تأكيد الانسحاب
            </Button>
            <Button variant="ghost" onClick={() => setFoldConfirm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {owed <= 0 ? (
              <Button variant="secondary" onClick={() => onAction("CHECK")}>
                تمرير
              </Button>
            ) : (
              <Button
                onClick={() => onAction("CALL")}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                مساواة <span className="num">{owed}</span>
              </Button>
            )}
            <Button variant="secondary" onClick={() => onAction("ALLIN")}>
              كل الرصيد
            </Button>
            <Button variant="destructive" onClick={() => setFoldConfirm(true)}>
              انسحاب
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={minRaiseTo}
              step={DEFAULT_GAME_CONFIG.minRaise}
              value={raiseTo}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              className="num"
              aria-label="مبلغ الرفع"
            />
            <Button
              onClick={() => onAction("RAISE", raiseTo)}
              disabled={raiseTo < minRaiseTo}
              className="shrink-0"
            >
              رفع إلى <span className="num">{raiseTo}</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ClaimPanel({
  ranks,
  deadlineTs,
  claimed,
  onPick,
}: {
  ranks: Array<{ id: string; code: string; nameAr: string; strength: number }>;
  deadlineTs: number | null;
  claimed: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm">
        <span className="font-bold text-primary">اختر ترابطك</span>
        <span className="text-muted-foreground"> — الاختيار الخاطئ يُخرجك من المنافسة</span>
      </div>

      <Countdown deadlineTs={deadlineTs} />
      {!claimed ? (
        <p className="text-center text-xs text-destructive/90">
          إن لم تختر قبل انتهاء الوقت ستفقد حقّك في المطالبة بالمجمّع
        </p>
      ) : null}
      <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {ranks.map((r) => (
          <button
            key={r.id}
            disabled={claimed != null}
            onClick={() => onPick(r.id)}
            className={cn(
              "flex items-center justify-between rounded-lg border bg-secondary/60 px-3 py-2.5 text-start transition",
              "hover:border-accent disabled:opacity-60",
              claimed === r.id && "border-primary glow-primary",
            )}
          >
            <span className="font-medium">{r.nameAr}</span>
            <span className="num text-xs text-muted-foreground">{10 - r.strength}</span>
          </button>
        ))}
      </div>
      {claimed ? (
        <p className="text-center text-sm text-muted-foreground">تم إرسال اختيارك. بانتظار البقية…</p>
      ) : null}
    </div>
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
  community,
  yourSeat,
  bestRank,
  isHost,
  onNextHand,
  onCloseTable,
  onExit,
  onContinue,
}: {
  results: GameResultEntry[];
  winningRankNameAr: string | null;
  players: PlayerView[];
  community: CardView[];
  yourSeat: number | null;
  bestRank: BestRankPayload | null;
  isHost: boolean;
  onNextHand: () => void;
  onCloseTable: () => void;
  onExit: () => void;
  onContinue: () => void;
}) {
  const [dealing, setDealing] = useState(false);

  const nameOf = (seat: number) =>
    players.find((p) => p.seat === seat)?.username ?? `مقعد ${seat}`;

  // A revealed player's full hand = their 2 hole cards + the 5 shared community
  // cards. Folders/last-standing have null holeCards (never revealed) → no cards.
  const fullHand = (holeCards: CardView[] | null): CardView[] | null =>
    holeCards && holeCards.length > 0 ? [...holeCards, ...community] : null;

  const winners = results.filter((r) => r.outcome === "WIN" || r.outcome === "SPLIT");
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

      <div className="relative z-10 my-auto w-full max-w-2xl space-y-4">
        {/* Winner section (revealed first) */}
        <motion.section
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-card/90 p-5 shadow-2xl"
        >
          {winners.length > 0 ? (
            <div className="mb-1 flex justify-center">
              <span className="glow-gold grid size-12 place-items-center rounded-full border border-gold/50 bg-gold/10 text-2xl">
                🏆
              </span>
            </div>
          ) : null}
          <div className="text-center text-sm font-bold text-gold">
            {winners.length > 1 ? "الفائزون" : "الفائز"}
          </div>
          {winners.length === 0 ? (
            <p className="mt-2 text-center text-muted-foreground">لا يوجد فائز — استُردّت المساهمات.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {winners.map((w) => (
                <div key={w.seat} className="space-y-1.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl font-extrabold text-foreground">
                      {w.seat === yourSeat ? "أنت" : nameOf(w.seat)}
                    </span>
                    <span className="num rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-extrabold text-primary">
                      +{w.coinsDelta}
                    </span>
                  </div>
                  <div className="text-sm">
                    <ClaimExplanation
                      rankNameAr={winningRankNameAr ?? w.claimedRankNameAr}
                      groups={w.claimEvidence}
                    />
                  </div>
                  {fullHand(w.holeCards) ? (
                    <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                      {fullHand(w.holeCards)!.map((c, i) => (
                        <FootballCard key={`${c.playerId}-${i}`} card={c} index={i} variant="result" />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Your OWN strongest combination — private per-seat reveal, shown to
            every dealt player (winner or not) on the winner screen only. */}
        {bestRank ? (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut", delay: 0.15 }}
            className="rounded-2xl border border-primary/30 bg-primary/5 p-4"
          >
            <div className="text-center text-xs font-bold text-primary">أقوى ترابط لديك</div>
            {bestRank.rankNameAr ? (
              <div className="mt-2 space-y-2 text-center">
                <ClaimExplanation rankNameAr={bestRank.rankNameAr} groups={bestRank.evidence} />
                {bestRank.cards.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                    {bestRank.cards.map((c, i) => (
                      <FootballCard key={`best-${c.playerId}-${i}`} card={c} index={i} variant="result" />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-center text-sm text-muted-foreground">
                لا يوجد ترابط مكتمل في بطاقاتك.
              </p>
            )}
          </motion.section>
        ) : null}

        {/* Losers section (revealed after) */}
        {losers.length > 0 ? (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold text-muted-foreground">الخاسرون</div>
            {losers.map((r, i) => {
              const mine = r.seat === yourSeat;
              const invalidClaim =
                r.claimValid === false && (r.outcome === "LOSE" || r.outcome === "REFUND");
              return (
                <motion.div
                  key={r.seat}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut", delay: 0.32 + i * 0.09 }}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl border p-3",
                    mine ? "border-primary/30 bg-primary/10" : "border-white/10 bg-card/80",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {mine ? "أنت" : nameOf(r.seat)}
                      <span className="mr-2 text-xs font-normal text-muted-foreground">
                        {OUTCOME_AR[r.outcome] ?? r.outcome}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "num font-extrabold",
                        r.coinsDelta >= 0 ? "text-primary" : "text-destructive",
                      )}
                    >
                      {r.coinsDelta >= 0 ? "+" : ""}
                      {r.coinsDelta}
                    </span>
                  </div>
                  {r.outcome === "FOLD" ? (
                    <div className="text-xs text-muted-foreground">انسحب من الجولة.</div>
                  ) : invalidClaim ? (
                    <div className="text-xs text-destructive/90">
                      {r.claimedRankNameAr ? (
                        <>
                          اختار <span className="text-foreground">{r.claimedRankNameAr}</span> — غير محقّق
                        </>
                      ) : (
                        "لم يختر ترابطًا محقّقًا"
                      )}
                    </div>
                  ) : r.claimEvidence || r.claimedRankNameAr ? (
                    <div className="text-xs">
                      <span className="text-muted-foreground">اختار: </span>
                      <ClaimExplanation rankNameAr={r.claimedRankNameAr} groups={r.claimEvidence} />
                    </div>
                  ) : null}
                  {fullHand(r.holeCards) ? (
                    <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                      {fullHand(r.holeCards)!.map((c, i) => (
                        <FootballCard key={`${c.playerId}-${i}`} card={c} index={i} variant="result" />
                      ))}
                    </div>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        ) : null}

        {/* Post-round controls: the host advances/closes the table; players
            continue or exit. The host role transfers if the creator exits. */}
        <div className="pt-1">
          {isHost ? (
            <div className="grid grid-cols-3 gap-2">
              <ResultAction
                glyph="▶"
                label="بدأ جولة جديدة"
                variant="primary"
                disabled={dealing}
                onClick={() => {
                  setDealing(true);
                  onNextHand();
                }}
              />
              <ResultAction glyph="✕" label="اغلاق الطاولة" variant="destructive" onClick={onCloseTable} />
              <ResultAction glyph="⮐" label="الخروج" variant="neutral" onClick={onExit} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <ResultAction glyph="▶" label="اكمال اللعب" variant="primary" onClick={onContinue} />
              <ResultAction glyph="⮐" label="الخروج" variant="neutral" onClick={onExit} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
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
