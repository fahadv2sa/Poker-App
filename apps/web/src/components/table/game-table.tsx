"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_GAME_CONFIG } from "@fp/shared";
import type { GameAuth } from "@/lib/realtime";
import { useGameSocket } from "@/lib/useGameSocket";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FootballCard, PHASE_AR, PlayerSeat, RANK_NAME_AR, TurnTimer } from "./parts";

const BETTING_PHASES = new Set(["PREFLOP", "FLOP", "TURN", "RIVER"]);

const OUTCOME_AR: Record<string, string> = {
  WIN: "فائز",
  SPLIT: "تقاسم",
  LOSE: "خاسر",
  FOLD: "منسحب",
  REFUND: "استُردّ",
};

export function GameTable({
  auth,
  inviteCode,
  roomName,
  isHost,
}: {
  auth: GameAuth;
  inviteCode: string;
  roomName: string;
  isHost: boolean;
}) {
  const { view, start, placeAction, selectClaim, clearError } = useGameSocket(auth, inviteCode);
  const s = view.state;
  const [raiseTo, setRaiseTo] = useState(0);
  const [claimed, setClaimed] = useState<string | null>(null);

  const players = useMemo(
    () => (s ? [...s.players].sort((a, b) => a.seat - b.seat) : []),
    [s],
  );
  const me = s?.yourSeat != null ? players.find((p) => p.seat === s.yourSeat) : undefined;

  const phase = s?.phase ?? "LOBBY";
  const isBetting = BETTING_PHASES.has(phase);
  const isMyTurn = isBetting && s?.currentTurnSeat === s?.yourSeat && me != null;
  const owed = s && me ? s.currentBet - me.committedThisRound : 0;
  const minRaiseTo = (s?.currentBet ?? 0) + DEFAULT_GAME_CONFIG.minRaise;

  useEffect(() => {
    if (isMyTurn) setRaiseTo(minRaiseTo);
  }, [isMyTurn, minRaiseTo]);

  useEffect(() => {
    if (phase !== "SHOWDOWN") setClaimed(null);
  }, [phase]);

  const isContender = me?.status === "ACTIVE" || me?.status === "ALLIN";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          {roomName}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {PHASE_AR[phase] ?? phase}
          </span>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              view.connected ? "border-primary/40 text-primary" : "text-muted-foreground",
            )}
          >
            {view.connected ? "● متصل" : "○ يتّصل…"}
          </span>
          <Button asChild variant="ghost">
            <Link href="/">← خروج</Link>
          </Button>
        </div>
      </header>

      {!s ? (
        <Card className="p-8 text-center text-muted-foreground">جارٍ الاتصال بالطاولة…</Card>
      ) : (
        <div className="grid gap-4 lg:[grid-template-columns:1fr_300px]">
          {/* ---------------------------------------------------------- felt */}
          <section className="felt relative flex min-h-[420px] flex-col justify-between gap-5 rounded-[22px] border border-primary/25 p-4 sm:p-8">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
              {players.map((p) => (
                <PlayerSeat
                  key={p.seat}
                  player={p}
                  isActive={s.currentTurnSeat === p.seat}
                  isYou={p.seat === s.yourSeat}
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-3">
              <motion.div
                key={s.pot}
                initial={{ scale: 0.85 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 font-extrabold text-gold"
              >
                🪙 المجمّع: <span className="num">{s.pot}</span>
                {s.currentBet > 0 ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    · الرهان <span className="num">{s.currentBet}</span>
                  </span>
                ) : null}
              </motion.div>

              <div className="flex flex-wrap justify-center gap-2">
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

            <div className="flex flex-col items-center gap-2">
              <span className="text-sm text-muted-foreground">بطاقتاك</span>
              <div className="flex flex-wrap justify-center gap-2">
                {view.hole.length > 0 ? (
                  view.hole.map((c, i) => <FootballCard key={c.playerId} card={c} index={i} />)
                ) : (
                  <>
                    <FootballCard back />
                    <FootballCard back />
                  </>
                )}
              </div>
            </div>
          </section>

          {/* --------------------------------------------------------- aside */}
          <aside className="flex flex-col gap-4">
            {phase === "LOBBY" ? (
              <Card className="flex flex-col gap-3 p-5">
                <h3 className="text-lg font-bold">غرفة الانتظار</h3>
                <p className="text-sm text-muted-foreground">
                  شارك كود الدعوة لانضمام اللاعبين، ثم ابدأ عند اكتمال لاعبَين على الأقل.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">كود الدعوة</span>
                  <code className="num rounded-md border px-2 py-1">{inviteCode}</code>
                </div>
                {isHost ? (
                  <Button onClick={start} disabled={players.length < 2} className="w-full">
                    {players.length < 2 ? "بانتظار لاعبين…" : "ابدأ اللعبة"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">بانتظار أن يبدأ المضيف اللعبة…</p>
                )}
              </Card>
            ) : null}

            {isMyTurn ? (
              <Card className="flex flex-col gap-3 p-5">
                <h3 className="text-lg font-bold">دورك</h3>
                <div className="flex flex-wrap gap-2">
                  {owed <= 0 ? (
                    <Button variant="secondary" onClick={() => placeAction("CHECK")}>
                      تمرير
                    </Button>
                  ) : (
                    <Button
                      onClick={() => placeAction("CALL")}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      مساواة <span className="num">{owed}</span>
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => placeAction("FOLD")}>
                    انسحاب
                  </Button>
                  <Button variant="secondary" onClick={() => placeAction("ALLIN")}>
                    كل الرصيد
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={minRaiseTo}
                    step={DEFAULT_GAME_CONFIG.minRaise}
                    value={raiseTo}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    className="num max-w-[120px]"
                  />
                  <Button onClick={() => placeAction("RAISE", raiseTo)} disabled={raiseTo < minRaiseTo}>
                    رفع إلى <span className="num">{raiseTo}</span>
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  أقل رفع: <span className="num">{minRaiseTo}</span>
                </p>
              </Card>
            ) : null}

            {phase === "SHOWDOWN" && isContender && view.showdown ? (
              <Card className="flex flex-col gap-3 p-5">
                <h3 className="text-lg font-bold">اختر ترابطك</h3>
                <p className="text-sm text-muted-foreground">
                  اختر أقوى ترابط تملكه. الاختيار الخاطئ يُخرجك من المنافسة.
                </p>
                <div className="flex flex-col gap-2">
                  {view.showdown.availableHandRanks.map((r) => (
                    <button
                      key={r.id}
                      disabled={claimed != null}
                      onClick={() => {
                        setClaimed(r.id);
                        selectClaim(r.id);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border bg-secondary px-3 py-2 text-start transition hover:border-accent disabled:opacity-60",
                        claimed === r.id && "border-primary glow-primary",
                      )}
                    >
                      <span>{RANK_NAME_AR[r.code] ?? r.code}</span>
                      <span className="text-xs text-muted-foreground">
                        القوة <span className="num">{r.strength}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {claimed ? (
                  <p className="text-sm text-muted-foreground">تم إرسال اختيارك. بانتظار البقية…</p>
                ) : null}
              </Card>
            ) : null}

            {phase === "SHOWDOWN" && !isContender ? (
              <Card className="p-5 text-muted-foreground">
                أنت خارج هذه الجولة — بانتظار النتيجة.
              </Card>
            ) : null}

            <AnimatePresence>
              {view.result ? (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="flex flex-col gap-3 p-5">
                    <h3 className="text-lg font-bold">النتيجة</h3>
                    {view.result.results.map((r) => {
                      const pos = r.coinsDelta >= 0;
                      return (
                        <div
                          key={r.seat}
                          className="flex items-center justify-between border-b border-border/60 py-2 last:border-0"
                        >
                          <span>
                            مقعد <span className="num">{r.seat}</span> ·{" "}
                            {OUTCOME_AR[r.outcome] ?? r.outcome}
                          </span>
                          <span className={cn("font-extrabold", pos ? "text-primary" : "text-destructive")}>
                            {pos ? "+" : ""}
                            <span className="num">{r.coinsDelta}</span>
                          </span>
                        </div>
                      );
                    })}
                    <Button asChild className="w-full">
                      <Link href="/rooms">طاولة جديدة</Link>
                    </Button>
                  </Card>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </aside>
        </div>
      )}

      <AnimatePresence>
        {view.error ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={clearError}
            className="fixed inset-x-0 bottom-5 mx-auto w-fit cursor-pointer rounded-md border border-destructive bg-secondary px-4 py-2 text-destructive-foreground shadow-xl"
            role="alert"
          >
            {view.error}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
