"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import type { GpRevealEvent, GpStateView } from "@fb/shared";
import { GpWinner } from "@/components/guess-player/GuessPlayerClient";
import { GpTable } from "@/components/guess-player/GpTable";
import type { GpRoundSummary } from "@/components/guess-player/GpSummary";

/**
 * PREVIEW ONLY — visual harness for the end-of-match WINNER screen and the
 * end-of-round REVEAL overlay, with realistic mock data (no socket/auth).
 * Gated by NEXT_PUBLIC_GP_PREVIEW=1 (set only in the local .env.local; prod
 * never sets it → 404), so it works under `next start` locally while staying
 * unreachable in production. Throwaway harness, mirrors the Top Ten preview.
 */

const SEATS: GpStateView["seats"] = [
  { seat: 0, userId: "me", username: "فهد العتيبي", playerNumber: 100001, connected: true, totalPoints: 875, status: "ACTIVE", guessesLeft: 2, isPicker: false, away: false },
  { seat: 1, userId: "u1", username: "خالد", playerNumber: 100002, connected: true, totalPoints: 620, status: "ACTIVE", guessesLeft: 1, isPicker: true, away: false },
  { seat: 2, userId: "u2", username: "نوّاف", playerNumber: 100003, connected: true, totalPoints: 455, status: "ACTIVE", guessesLeft: 0, isPicker: false, away: false },
  { seat: 3, userId: "u3", username: "سلطان", playerNumber: 100004, connected: false, totalPoints: 150, status: "WITHDRAWN", guessesLeft: 3, isPicker: false, away: false },
];

function baseState(over: Partial<GpStateView>): GpStateView {
  return {
    matchId: "preview",
    kind: "MANUAL",
    mode: "VS_HUMANS",
    inviteCode: "G7421",
    roomName: "طاولة المحققين",
    maxPlayers: 6,
    status: "ENDED",
    difficulty: null,
    createdByUserId: "me",
    roundNo: 3,
    phase: null,
    seats: SEATS,
    questions: [],
    wrongGuesses: [],
    turnSeat: null,
    deadlineTs: null,
    roundDeadlineTs: null,
    newMatchRequest: { readySeats: [1], needed: 3, deadlineTs: Date.now() + 15_000 },
    ...over,
  };
}

const LAST_ROUND_SOLVED: GpRoundSummary = {
  reason: "CORRECT_GUESS",
  player: { id: "p1", name: "Mohamed Salah", nameAr: "محمد صلاح", photoUrl: null },
  winnerSeat: 0,
  winnerPoints: 415,
  pickerSeat: 1,
  pickerPoints: 104,
};

const LAST_ROUND_TIMEOUT: GpRoundSummary = {
  reason: "TIMER",
  player: { id: "p2", name: "Yaya Touré", nameAr: "يايا توريه", photoUrl: null },
  winnerSeat: null,
  winnerPoints: 0,
  pickerSeat: 1,
  pickerPoints: 150,
};

const QUESTIONS: GpStateView["questions"] = [
  { turnNo: 1, seat: 0, template: "NATIONALITY", params: { countryName: "مصر" }, answer: "YES" },
  { turnNo: 2, seat: 2, template: "CLUB_EVER", params: { clubName: "ريال مدريد" }, answer: "NO" },
  { turnNo: 3, seat: 0, template: "COMPETITION_EVER", params: { competitionName: "الدوري الإنجليزي الممتاز" }, answer: "YES" },
  { turnNo: 4, seat: 2, template: "TROPHY_WITH_CLUB", params: { trophyName: "دوري أبطال أوروبا", clubName: "ليفربول" }, answer: "YES" },
  { turnNo: 5, seat: 0, template: "CLUB_SEASON", params: { clubName: "تشيلسي", season: 2005 }, answer: "UNKNOWN" },
];

const WRONG_GUESSES: GpStateView["wrongGuesses"] = [
  { seat: 2, player: { id: "x1", name: "S. Mané", nameAr: "ساديو ماني" }, attemptsLeft: 2 },
];

const REVEAL_SOLVED: GpRevealEvent = {
  roundNo: 3,
  reason: "CORRECT_GUESS",
  player: { id: "p1", name: "Mohamed Salah", nameAr: "محمد صلاح", photoUrl: null },
  winnerSeat: 0,
  winnerPoints: 415,
  pickerSeat: 1,
  pickerPoints: 104,
};

const REVEAL_TIMEOUT: GpRevealEvent = {
  roundNo: 3,
  reason: "TIMER",
  player: { id: "p1", name: "Mohamed Salah", nameAr: "محمد صلاح", photoUrl: null },
  winnerSeat: null,
  winnerPoints: 0,
  pickerSeat: 1,
  pickerPoints: 150,
};

type View = "winner" | "tie" | "abandoned" | "reveal-win" | "reveal-timeout" | "composer";

export default function PreviewWinner() {
  const [view, setView] = useState<View>("winner");

  // Local-only visual harness — the flag is never set in production → 404.
  if (process.env.NEXT_PUBLIC_GP_PREVIEW !== "1") notFound();

  const btn = (active: boolean) =>
    `rounded px-2 py-0.5 ${active ? "bg-[var(--gold)] text-black" : "bg-white/10"}`;

  const tieSeats = SEATS.map((s) =>
    s.seat <= 1 ? { ...s, totalPoints: 700, status: "ACTIVE" as const } : s,
  );
  const tieStandings = tieSeats.map((s, i) => ({
    userId: s.userId,
    username: s.username,
    seat: s.seat,
    points: s.status === "WITHDRAWN" ? 0 : s.totalPoints,
    place: i <= 1 ? 1 : i + 1,
    tiedWithPrev: i === 1,
  }));

  const isReveal = view === "reveal-win" || view === "reveal-timeout";

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden bg-[var(--lu-abyss)] px-4 pb-6 page-top">
      <div className="fixed inset-x-0 top-0 z-[200] flex flex-wrap items-center justify-center gap-1 bg-black/75 px-2 py-1 text-[0.68rem] text-white/80 backdrop-blur">
        <span className="opacity-70">معاينة:</span>
        <button onClick={() => setView("winner")} className={btn(view === "winner")}>🏆 بين الجولات</button>
        <button onClick={() => setView("tie")} className={btn(view === "tie")}>🤝 إغلاق الجلسة: تعادل</button>
        <button onClick={() => setView("abandoned")} className={btn(view === "abandoned")}>🚪 مهجورة</button>
        <span className="mx-1 opacity-50">|</span>
        <button onClick={() => setView("reveal-win")} className={btn(view === "reveal-win")}>كشف الجولة: فائز</button>
        <button onClick={() => setView("reveal-timeout")} className={btn(view === "reveal-timeout")}>كشف الجولة: انتهى الوقت</button>
        <button onClick={() => setView("composer")} className={btn(view === "composer")}>🎛 لوحة السؤال والتخمين</button>
      </div>

      <div className="pt-8" />

      {view === "winner" ? (
        <GpWinner
          state={baseState({})}
          meId="me"
          result={null}
          lastRound={LAST_ROUND_SOLVED}
          abandoned={false}
          onNewMatch={() => console.log("newMatch")}
          onClose={() => console.log("close")}
          onExit={() => console.log("exit")}
        />
      ) : null}

      {view === "tie" ? (
        <GpWinner
          state={baseState({ seats: tieSeats })}
          meId="me"
          result={{ match: 1, standings: tieStandings, seats: tieSeats }}
          lastRound={LAST_ROUND_TIMEOUT}
          abandoned={false}
          onNewMatch={() => console.log("newMatch")}
          onClose={() => console.log("close")}
          onExit={() => console.log("exit")}
        />
      ) : null}

      {view === "abandoned" ? (
        <GpWinner
          state={baseState({ status: "ABANDONED", newMatchRequest: null })}
          meId="me"
          result={null}
          lastRound={LAST_ROUND_TIMEOUT}
          abandoned
          onNewMatch={() => console.log("newMatch")}
          onExit={() => console.log("exit")}
        />
      ) : null}

      {isReveal || view === "composer" ? (
        <GpTable
          state={baseState({
            status: "IN_PROGRESS",
            phase: "PLAYING",
            questions: QUESTIONS,
            wrongGuesses: WRONG_GUESSES,
            turnSeat: 0,
            deadlineTs: Date.now() + 14_000,
            roundDeadlineTs: Date.now() + 175_000,
            newMatchRequest: null,
          })}
          meId="me"
          reveal={
            isReveal ? { event: view === "reveal-win" ? REVEAL_SOLVED : REVEAL_TIMEOUT, id: 1 } : null
          }
          myPick={null}
          onAsk={(q) => console.log("ask", q)}
          onGuess={(id) => console.log("guess", id)}
          onPick={(id) => console.log("pick", id)}
          onLeave={() => console.log("leave")}
        />
      ) : null}
    </main>
  );
}
