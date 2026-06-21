"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DEFAULT_GAME_CONFIG,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Countdown, FootballCard, OpponentSeat, PHASE_AR } from "./parts";

const BETTING_PHASES = new Set(["PREFLOP", "FLOP", "TURN", "RIVER"]);

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
  const { view, start, nextHand, closeTable, placeAction, selectClaim, clearError } =
    useGameSocket(token, inviteCode);
  const router = useRouter();
  const s = view.state;
  const [raiseTo, setRaiseTo] = useState(0);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const players = useMemo(
    () => (s ? [...s.players].sort((a, b) => a.seat - b.seat) : []),
    [s],
  );
  const yourSeat = s?.yourSeat ?? null;
  const me = yourSeat != null ? players.find((p) => p.seat === yourSeat) : undefined;
  const opponents = players.filter((p) => p.seat !== yourSeat);

  const phase = s?.phase ?? "LOBBY";
  const isBetting = BETTING_PHASES.has(phase);
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
          <span className="size-2.5 shrink-0 rounded-full bg-primary glow-primary" />
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
          {isHost ? (
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
          <Button asChild variant="ghost" size="sm">
            <Link href="/">خروج</Link>
          </Button>
        </div>
      </header>

      {!s ? (
        <div className="grid flex-1 place-items-center text-muted-foreground">
          <span className="animate-pulse">جارٍ الاتصال بالطاولة…</span>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------ table centerpiece */}
          <section
            className="felt relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 rounded-[44px] border border-primary/20 px-4 py-6 sm:px-8 sm:py-9"
            style={{ boxShadow: "inset 0 0 0 1px rgba(46,230,166,0.06), inset 0 0 70px rgba(0,0,0,0.5), 0 18px 50px rgba(0,0,0,0.5)" }}
          >
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
                  />
                ))
              )}
            </div>

            {/* focal point: pot(s) + community + timer */}
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2">
              <motion.div
                key={s.pot}
                initial={{ scale: 0.8, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-[#0b0f1a]/60 px-5 py-2 font-extrabold text-gold shadow-lg backdrop-blur"
              >
                🪙 <span className="num text-lg">{s.pot}</span>
                {s.currentBet > 0 ? (
                  <span className="text-xs font-medium text-white/55">
                    · الرهان <span className="num">{s.currentBet}</span>
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
        {view.result ? (
          <ResultOverlay
            results={view.result.results}
            winningRankNameAr={view.result.winningRankNameAr}
            players={players}
            community={(s?.communityCards ?? []).filter((c): c is CardView => c !== null)}
            yourSeat={yourSeat}
            isHost={isHost}
            onNextHand={nextHand}
          />
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
        <Button variant="destructive" onClick={() => onAction("FOLD")}>
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
  isHost,
  onNextHand,
}: {
  results: GameResultEntry[];
  winningRankNameAr: string | null;
  players: PlayerView[];
  community: CardView[];
  yourSeat: number | null;
  isHost: boolean;
  onNextHand: () => void;
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
      <div className="my-auto w-full max-w-2xl space-y-4">
        {/* Winner section (revealed first) */}
        <motion.section
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-card/90 p-5 shadow-2xl"
        >
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

        {/* The page never auto-dismisses — only the host advances the round. */}
        <div className="pt-1">
          {isHost ? (
            <Button
              onClick={() => {
                setDealing(true);
                onNextHand();
              }}
              disabled={dealing}
              className="w-full"
              size="lg"
            >
              {dealing ? "يبدأ…" : "الجولة التالية"}
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              بانتظار أن يبدأ المضيف الجولة التالية…
            </p>
          )}
        </div>
      </div>
    </motion.div>
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
