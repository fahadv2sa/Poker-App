"use client";

import { useState } from "react";
import type { TtCardView, TtSeatView, TtStateView } from "@fb/shared";
import { TenTable } from "@/components/table/TenTable";

/**
 * PREVIEW ONLY — P1 playable skeleton of the Top Ten live table (visual; mock state,
 * no socket/auth). Use the control strip to vary how many cards are revealed and whose
 * turn it is, and to sanity-check the layout on different phone sizes (DevTools device
 * toolbar). The real table reuses <TenTable> verbatim with live socket state in P3.
 * Throwaway harness; not linked anywhere.
 */

const NAMES: { name: string; nameAr: string }[] = [
  { name: "L. Messi", nameAr: "ليونيل ميسي" },
  { name: "K. Benzema", nameAr: "كريم بنزيما" },
  { name: "L. Suárez", nameAr: "لويس سواريز" },
  { name: "Gerard Moreno", nameAr: "جيرارد مورينو" },
  { name: "A. Griezmann", nameAr: "أنطوان جريزمان" },
  { name: "Iago Aspas", nameAr: "ياغو أسباس" },
  { name: "C. Stuani", nameAr: "كريستيان ستواني" },
  { name: "Y. En-Nesyri", nameAr: "يوسف النصيري" },
  { name: "G. Moreno", nameAr: "خيرارد مورينو" },
  { name: "R. de Tomás", nameAr: "راؤول دي توماس" },
];
const VALUES = [24, 22, 19, 18, 16, 14, 13, 11, 10, 8];

function seat(i: number, username: string, userId: string, totalPoints: number, roundPoints: number, isBot = false): TtSeatView {
  return {
    seat: i,
    userId,
    username,
    playerNumber: 9000 + i,
    isBot,
    connected: true,
    totalPoints,
    roundPoints,
    status: "ACTIVE",
    wrongAttempts: 0,
    locked: false,
  };
}

function makeCards(revealedCount: number, seatsForReveal: number[]): TtCardView[] {
  return Array.from({ length: 10 }, (_, idx) => {
    const rank = idx + 1;
    const revealed = idx < revealedCount;
    return {
      rank,
      revealed,
      player: revealed
        ? { id: `p${rank}`, name: NAMES[idx]!.name, nameAr: NAMES[idx]!.nameAr, value: VALUES[idx]!, photoUrl: null }
        : null,
      bySeat: revealed ? seatsForReveal[idx % seatsForReveal.length]! : null,
    };
  });
}

export default function PreviewTable() {
  const [revealedCount, setRevealedCount] = useState(4);
  const [turnIsMe, setTurnIsMe] = useState(true);
  const [hint, setHint] = useState(false);

  const seats: TtSeatView[] = [
    seat(0, "أنا", "me", 31, 12),
    seat(1, "خالد", "u1", 27, 9),
    seat(2, "نوّاف", "u2", 22, 5),
    seat(3, "بوت", "u3", 18, 7, true),
  ];

  const state: TtStateView = {
    matchId: "preview",
    kind: "QUICK_PLAY",
    inviteCode: null,
    status: "IN_PROGRESS",
    difficulty: "MEDIUM",
    createdByUserId: "me",
    roundTimerSec: 600,
    roundNo: 2,
    roundsTotal: 3,
    mode: hint ? "HINT" : "NORMAL",
    question: {
      type: "GOAL_SCORERS",
      titleAr: "أكثر اللاعبين تسجيلاً للأهداف — الدوري الإسباني 2020",
      competitionAr: "الدوري الإسباني",
      season: 2020,
    },
    cards: makeCards(revealedCount, [0, 1, 2, 3]),
    seats,
    turnSeat: turnIsMe ? 0 : 1,
    deadlineTs: Date.now() + 22_000,
    hint: hint ? { phase: "OPEN", text: "لاعب فاز بالكرة الذهبية", hintNumber: 1 } : null,
    endRoundRequest: null,
  };

  return (
    <div className="relative">
      {/* dev control strip */}
      <div className="fixed inset-x-0 top-0 z-[200] flex flex-wrap items-center justify-center gap-1.5 bg-black/70 px-2 py-1 text-[0.7rem] text-white/80 backdrop-blur">
        <span className="opacity-70">PREVIEW P1:</span>
        {[0, 4, 7, 10].map((n) => (
          <button key={n} onClick={() => setRevealedCount(n)} className={`rounded px-2 py-0.5 ${revealedCount === n ? "bg-[var(--gold)] text-black" : "bg-white/10"}`}>
            كشف {n}
          </button>
        ))}
        <button onClick={() => setTurnIsMe((v) => !v)} className="rounded bg-white/10 px-2 py-0.5">
          {turnIsMe ? "دوري" : "دور الخصم"}
        </button>
        <button onClick={() => setHint((v) => !v)} className={`rounded px-2 py-0.5 ${hint ? "bg-[var(--lu-ember)] text-black" : "bg-white/10"}`}>
          تلميح (حدود حمراء)
        </button>
      </div>

      <TenTable state={state} meId="me" nickname="أنا" onPick={(id) => console.log("pick", id)} onLeave={() => console.log("leave")} />
    </div>
  );
}
