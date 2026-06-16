"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_GAME_CONFIG } from "@fp/shared";
import { useGameSocket } from "@/lib/useGameSocket";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FootballCard, OpponentSeat, PHASE_AR, TurnTimer } from "./parts";

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
  const { view, start, placeAction, selectClaim, clearError } = useGameSocket(token, inviteCode);
  const s = view.state;
  const [raiseTo, setRaiseTo] = useState(0);
  const [claimed, setClaimed] = useState<string | null>(null);

  const players = useMemo(
    () => (s ? [...s.players].sort((a, b) => a.seat - b.seat) : []),
    [s],
  );
  const yourSeat = s?.yourSeat ?? null;
  const me = yourSeat != null ? players.find((p) => p.seat === yourSeat) : undefined;
  const opponents = players.filter((p) => p.seat !== yourSeat);

  const phase = s?.phase ?? "LOBBY";
  const isBetting = BETTING_PHASES.has(phase);
  const isMyTurn = isBetting && s?.currentTurnSeat === yourSeat && me != null;
  const owed = s && me ? s.currentBet - me.committedThisRound : 0;
  const minRaiseTo = (s?.currentBet ?? 0) + DEFAULT_GAME_CONFIG.minRaise;
  const isContender = me?.status === "ACTIVE" || me?.status === "ALLIN";

  // Display-only balance. Across a multi-hand session (feature #7) the base is
  // the last resolved hand's authoritative finalBalance (view.balance); during a
  // live hand we subtract what's committed. The server is always the real source.
  const base = view.balance ?? initialBalance;
  const shownBalance = view.result ? base : base - Number(me?.committedTotal ?? 0);

  useEffect(() => {
    if (isMyTurn) setRaiseTo(minRaiseTo);
  }, [isMyTurn, minRaiseTo]);
  useEffect(() => {
    if (phase !== "SHOWDOWN") setClaimed(null);
  }, [phase]);

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
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm text-gold">
            🪙 <span className="num font-semibold">{shownBalance}</span>
          </span>
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
                  <OpponentSeat key={p.seat} player={p} isActive={s.currentTurnSeat === p.seat} />
                ))
              )}
            </div>

            {/* focal point: pot + community + timer */}
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

              <TurnTimer deadlineTs={s.currentTurnSeat != null ? s.turnDeadlineTs : null} />
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
                <LobbyPanel
                  inviteCode={inviteCode}
                  isHost={isHost}
                  canStart={players.length >= 2}
                  onStart={start}
                />
              ) : isMyTurn ? (
                <ActionBar
                  owed={owed}
                  minRaiseTo={minRaiseTo}
                  raiseTo={raiseTo}
                  setRaiseTo={setRaiseTo}
                  onAction={placeAction}
                />
              ) : phase === "SHOWDOWN" && isContender && view.showdown ? (
                <ClaimPanel
                  ranks={view.showdown.availableHandRanks}
                  claimed={claimed}
                  onPick={(id) => {
                    setClaimed(id);
                    selectClaim(id);
                  }}
                />
              ) : view.result ? (
                <ResultPanel results={view.result.results} yourSeat={yourSeat} />
              ) : (
                <WaitingHint phase={phase} turnSeat={s.currentTurnSeat} />
              )}
            </div>
          </div>
        </>
      )}

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
}: {
  owed: number;
  minRaiseTo: number;
  raiseTo: number;
  setRaiseTo: (n: number) => void;
  onAction: (type: string, amount?: number) => void;
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
  claimed,
  onPick,
}: {
  ranks: Array<{ id: string; code: string; nameAr: string; strength: number }>;
  claimed: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm">
        <span className="font-bold text-primary">اختر ترابطك</span>
        <span className="text-muted-foreground"> — الاختيار الخاطئ يُخرجك من المنافسة</span>
      </div>
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
            <span className="num text-xs text-muted-foreground">{r.strength}</span>
          </button>
        ))}
      </div>
      {claimed ? (
        <p className="text-center text-sm text-muted-foreground">تم إرسال اختيارك. بانتظار البقية…</p>
      ) : null}
    </div>
  );
}

function ResultPanel({
  results,
  yourSeat,
}: {
  results: Array<{ seat: number; outcome: string; coinsDelta: number }>;
  yourSeat: number | null;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      <span className="text-center font-bold text-primary">انتهت الجولة</span>
      <div className="flex flex-col gap-1">
        {results.map((r) => {
          const pos = r.coinsDelta >= 0;
          return (
            <div
              key={r.seat}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2",
                r.seat === yourSeat ? "bg-primary/10" : "bg-secondary/30",
              )}
            >
              <span className="text-sm">
                {r.seat === yourSeat ? "أنت" : `مقعد ${r.seat}`} · {OUTCOME_AR[r.outcome] ?? r.outcome}
              </span>
              <span className={cn("num font-extrabold", pos ? "text-primary" : "text-destructive")}>
                {pos ? "+" : ""}
                {r.coinsDelta}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        الجولة التالية تبدأ تلقائيًا…
      </p>
    </motion.div>
  );
}

function WaitingHint({ phase, turnSeat }: { phase: string; turnSeat: number | null }) {
  return (
    <p className="py-1 text-center text-sm text-muted-foreground">
      {phase === "SHOWDOWN"
        ? "بانتظار اختيارات اللاعبين…"
        : turnSeat != null
          ? `الدور على مقعد ${turnSeat}…`
          : "بانتظار الجولة…"}
    </p>
  );
}
