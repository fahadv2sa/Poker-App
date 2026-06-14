"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_GAME_CONFIG } from "@fp/shared";
import type { GameAuth } from "@/lib/realtime";
import { useGameSocket } from "@/lib/useGameSocket";
import { FootballCard, PHASE_AR, PlayerSeat, RANK_NAME_AR, TurnTimer } from "./parts";

const BETTING_PHASES = new Set(["PREFLOP", "FLOP", "TURN", "RIVER"]);

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

  // Reset claim selection at the start of each showdown.
  useEffect(() => {
    if (phase !== "SHOWDOWN") setClaimed(null);
  }, [phase]);

  const isContender = me?.status === "ACTIVE" || me?.status === "ALLIN";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          {roomName}
        </div>
        <div className="row">
          <span className="pill">{PHASE_AR[phase] ?? phase}</span>
          <span className={`pill ${view.connected ? "live" : ""}`}>
            {view.connected ? "● متصل" : "○ يتّصل…"}
          </span>
          <Link href="/" className="btn btn-ghost">
            ← خروج
          </Link>
        </div>
      </header>

      {!s ? (
        <div className="card pad-lg center muted">جارٍ الاتصال بالطاولة…</div>
      ) : (
        <div className="table-wrap">
          {/* ---------------------------------------------------------- felt */}
          <section className="felt">
            <div className="seats">
              {players.map((p) => (
                <PlayerSeat
                  key={p.seat}
                  player={p}
                  isActive={s.currentTurnSeat === p.seat}
                  isYou={p.seat === s.yourSeat}
                />
              ))}
            </div>

            <div className="board">
              <div className="pot">
                🪙 المجمّع: <span className="num">{s.pot}</span>
                {s.currentBet > 0 ? (
                  <span className="muted small">
                    {" "}· الرهان الحالي <span className="num">{s.currentBet}</span>
                  </span>
                ) : null}
              </div>
              <div className="cards-row">
                {Array.from({ length: 5 }).map((_, i) => (
                  <FootballCard key={i} card={s.communityCards[i] ?? null} back={!s.communityCards[i]} />
                ))}
              </div>
              <TurnTimer deadlineTs={s.currentTurnSeat != null ? s.turnDeadlineTs : null} />
            </div>

            <div className="board">
              <span className="muted small">بطاقتاك</span>
              <div className="cards-row">
                {view.hole.length > 0 ? (
                  view.hole.map((c) => <FootballCard key={c.playerId} card={c} />)
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
          <aside className="stack">
            {phase === "LOBBY" ? (
              <section className="card stack">
                <h3>غرفة الانتظار</h3>
                <p className="muted small">
                  شارك كود الدعوة لانضمام اللاعبين، ثم ابدأ عند اكتمال لاعبَين على الأقل.
                </p>
                <div className="row spread">
                  <span className="muted small">كود الدعوة</span>
                  <code className="pill num">{inviteCode}</code>
                </div>
                {isHost ? (
                  <button
                    className="btn btn-primary block"
                    onClick={start}
                    disabled={players.length < 2}
                  >
                    {players.length < 2 ? "بانتظار لاعبين…" : "ابدأ اللعبة"}
                  </button>
                ) : (
                  <p className="muted small">بانتظار أن يبدأ المضيف اللعبة…</p>
                )}
              </section>
            ) : null}

            {isMyTurn ? (
              <section className="card stack">
                <h3>دورك</h3>
                <div className="actionbar">
                  {owed <= 0 ? (
                    <button className="btn" onClick={() => placeAction("CHECK")}>
                      تمرير (Check)
                    </button>
                  ) : (
                    <button className="btn btn-accent" onClick={() => placeAction("CALL")}>
                      مساواة <span className="num">{owed}</span>
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={() => placeAction("FOLD")}>
                    انسحاب
                  </button>
                  <button className="btn" onClick={() => placeAction("ALLIN")}>
                    كل الرصيد
                  </button>
                </div>
                <div className="raise-row">
                  <input
                    className="input num"
                    type="number"
                    min={minRaiseTo}
                    step={DEFAULT_GAME_CONFIG.minRaise}
                    value={raiseTo}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    style={{ maxWidth: 120 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => placeAction("RAISE", raiseTo)}
                    disabled={raiseTo < minRaiseTo}
                  >
                    رفع إلى <span className="num">{raiseTo}</span>
                  </button>
                </div>
                <p className="muted small">أقل رفع: <span className="num">{minRaiseTo}</span></p>
              </section>
            ) : null}

            {phase === "SHOWDOWN" && isContender && view.showdown ? (
              <section className="card stack">
                <h3>اختر ترابطك</h3>
                <p className="muted small">
                  اختر أقوى ترابط تملكه. الاختيار الخاطئ يُخرجك من المنافسة.
                </p>
                <div className="claim-grid">
                  {view.showdown.availableHandRanks.map((r) => (
                    <button
                      key={r.id}
                      className={`claim-item ${claimed === r.id ? "selected" : ""}`}
                      disabled={claimed != null}
                      onClick={() => {
                        setClaimed(r.id);
                        selectClaim(r.id);
                      }}
                    >
                      <span>{RANK_NAME_AR[r.code] ?? r.code}</span>
                      <span className="strength">
                        القوة <span className="num">{r.strength}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {claimed ? <p className="muted small">تم إرسال اختيارك. بانتظار البقية…</p> : null}
              </section>
            ) : null}

            {phase === "SHOWDOWN" && !isContender ? (
              <section className="card">
                <p className="muted">أنت خارج هذه الجولة — بانتظار النتيجة.</p>
              </section>
            ) : null}

            {view.result ? (
              <section className="card stack">
                <h3>النتيجة</h3>
                {view.result.results.map((r) => {
                  const pos = r.coinsDelta >= 0;
                  return (
                    <div key={r.seat} className="result-row">
                      <span>
                        مقعد <span className="num">{r.seat}</span> ·{" "}
                        {OUTCOME_AR[r.outcome] ?? r.outcome}
                      </span>
                      <span className={pos ? "delta-pos" : "delta-neg"}>
                        {pos ? "+" : ""}
                        <span className="num">{r.coinsDelta}</span>
                      </span>
                    </div>
                  );
                })}
                <Link href="/rooms" className="btn btn-primary block">
                  طاولة جديدة
                </Link>
              </section>
            ) : null}
          </aside>
        </div>
      )}

      {view.error ? (
        <div className="toast" role="alert" onClick={clearError}>
          {view.error}
        </div>
      ) : null}
    </main>
  );
}

const OUTCOME_AR: Record<string, string> = {
  WIN: "فائز",
  SPLIT: "تقاسم",
  LOSE: "خاسر",
  FOLD: "منسحب",
  REFUND: "استُردّ",
};
