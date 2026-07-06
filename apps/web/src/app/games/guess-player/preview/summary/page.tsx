"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import type { GpStateView } from "@fb/shared";
import { GpSummary, type GpRoundSummary } from "@/components/guess-player/GpSummary";

/**
 * PREVIEW ONLY — visual harness for the table SUMMARY screen (final ruling:
 * collapsed round rows, expandable details, NO standings — those live only on
 * the winner screen). Gated by NEXT_PUBLIC_GP_PREVIEW=1 (local only → 404 in
 * production). Throwaway harness.
 */

const SEATS: GpStateView["seats"] = [
  { seat: 0, userId: "me", username: "فهد العتيبي", playerNumber: 100001, connected: true, totalPoints: 875, status: "ACTIVE", guessesLeft: 2, isPicker: false, away: false },
  { seat: 1, userId: "u1", username: "خالد", playerNumber: 100002, connected: true, totalPoints: 620, status: "ACTIVE", guessesLeft: 1, isPicker: true, away: false },
  { seat: 2, userId: "u2", username: "نوّاف", playerNumber: 100003, connected: true, totalPoints: 455, status: "ACTIVE", guessesLeft: 0, isPicker: false, away: false },
  { seat: 3, userId: "u3", username: "سلطان", playerNumber: 100004, connected: false, totalPoints: 0, status: "WITHDRAWN", guessesLeft: 3, isPicker: false, away: false },
];

const ROUNDS: GpRoundSummary[] = [
  {
    reason: "CORRECT_GUESS",
    player: { id: "p1", name: "Mohamed Salah", nameAr: "محمد صلاح", photoUrl: null },
    winnerSeat: 0,
    winnerPoints: 415,
    pickerSeat: 1,
    pickerPoints: 104,
  },
  {
    reason: "TIMER",
    player: { id: "p2", name: "Yaya Touré", nameAr: "يايا توريه", photoUrl: null },
    winnerSeat: null,
    winnerPoints: 0,
    pickerSeat: 0,
    pickerPoints: 150,
  },
  {
    reason: "CORRECT_GUESS",
    player: { id: "p3", name: "G. Johnson", nameAr: "جلين جونسون", photoUrl: null },
    winnerSeat: 2,
    winnerPoints: 230,
    pickerSeat: 0,
    pickerPoints: 58,
  },
];

type View = "full" | "early" | "single";

export default function PreviewSummary() {
  const [view, setView] = useState<View>("full");

  // Local-only visual harness — the flag is never set in production → 404.
  if (process.env.NEXT_PUBLIC_GP_PREVIEW !== "1") notFound();

  const btn = (active: boolean) =>
    `rounded px-2 py-0.5 ${active ? "bg-[var(--gold)] text-black" : "bg-white/10"}`;

  const rounds = view === "full" ? ROUNDS : view === "early" ? ROUNDS.slice(0, 2) : ROUNDS.slice(0, 1);

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden bg-[var(--lu-abyss)] px-4 pb-6 page-top">
      <div className="fixed inset-x-0 top-0 z-[200] flex flex-wrap items-center justify-center gap-1 bg-black/75 px-2 py-1 text-[0.68rem] text-white/80 backdrop-blur">
        <span className="opacity-70">معاينة الملخص:</span>
        <button onClick={() => setView("full")} className={btn(view === "full")}>🏁 مباراة كاملة (٣ جولات)</button>
        <button onClick={() => setView("early")} className={btn(view === "early")}>🚪 خروج مبكر (جولتان)</button>
        <button onClick={() => setView("single")} className={btn(view === "single")}>1️⃣ جولة واحدة</button>
      </div>

      <GpSummary key={view} rounds={rounds} seats={SEATS} meId="me" onClose={() => console.log("close")} />
    </main>
  );
}
