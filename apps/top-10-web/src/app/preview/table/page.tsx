"use client";

import { useState } from "react";
import type { TtCardView, TtRevealEvent, TtSeatView, TtStateView } from "@fb/shared";
import { TenTable } from "@/components/table/TenTable";

/**
 * PREVIEW ONLY — P2 of the Top Ten live table (visual; mock state, no socket/auth).
 * Adds the big correct-guess notice + full hint mode on top of the P1 skeleton. Use the
 * control strip to reveal cards, fire a reveal notice (incl. the rank-10 jackpot), step
 * hint mode through its phases, and rack up wrong attempts. The real table reuses
 * <TenTable> verbatim with live socket state in P3. Throwaway harness.
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

function seat(i: number, username: string, userId: string, total: number, round: number, opts: Partial<TtSeatView> = {}): TtSeatView {
  return {
    seat: i, userId, username, playerNumber: 9000 + i, isBot: false, connected: true,
    totalPoints: total, roundPoints: round, status: "ACTIVE", wrongAttempts: 0, locked: false, ...opts,
  };
}

function makeCards(revealedCount: number, seatsForReveal: number[]): TtCardView[] {
  return Array.from({ length: 10 }, (_, idx) => {
    const rank = idx + 1;
    const revealed = idx < revealedCount;
    return {
      rank,
      revealed,
      player: revealed ? { id: `p${rank}`, name: NAMES[idx]!.name, nameAr: NAMES[idx]!.nameAr, value: VALUES[idx]!, photoUrl: null } : null,
      bySeat: revealed ? seatsForReveal[idx % seatsForReveal.length]! : null,
    };
  });
}

type HintPhase = "off" | "countdown" | "open";

export default function PreviewTable() {
  const [revealedCount, setRevealedCount] = useState(3);
  const [turnIsMe, setTurnIsMe] = useState(true);
  const [hintPhase, setHintPhase] = useState<HintPhase>("off");
  const [myWrong, setMyWrong] = useState(0);
  const [reveal, setReveal] = useState<{ event: TtRevealEvent; id: number } | null>(null);

  function fireReveal(rank: number) {
    const idx = rank - 1;
    setRevealedCount((c) => Math.max(c, rank));
    setReveal({
      id: Date.now(),
      event: {
        rank,
        bySeat: rank % 4,
        points: rank,
        player: { id: `p${rank}`, name: NAMES[idx]!.name, nameAr: NAMES[idx]!.nameAr, value: VALUES[idx]!, photoUrl: null },
      },
    });
  }

  const seats: TtSeatView[] = [
    seat(0, "فهد العتيبي", "me", 31, 12, { wrongAttempts: myWrong, locked: myWrong >= 3 }),
    seat(1, "خالد", "u1", 27, 9),
    seat(2, "نوّاف", "u2", 22, 5),
    seat(3, "بوت", "u3", 18, 7, { isBot: true }),
  ];

  const mode = hintPhase === "off" ? "NORMAL" : "HINT";
  const deadlineTs = hintPhase === "countdown" ? Date.now() + 10_000 : Date.now() + 22_000;

  const state: TtStateView = {
    matchId: "preview", kind: "QUICK_PLAY", inviteCode: null, status: "IN_PROGRESS",
    difficulty: "MEDIUM", createdByUserId: "me", roundTimerSec: 600, roundNo: 2, roundsTotal: 3,
    mode,
    question: { type: "GOAL_SCORERS", titleAr: "أكثر اللاعبين تسجيلاً للأهداف — الدوري الإسباني 2020", competitionAr: "الدوري الإسباني", season: 2020 },
    cards: makeCards(revealedCount, [0, 1, 2, 3]),
    seats,
    turnSeat: turnIsMe ? 0 : 1,
    deadlineTs,
    hint: hintPhase === "off" ? null : { phase: hintPhase === "countdown" ? "COUNTDOWN" : "OPEN", text: "لاعب فاز بالكرة الذهبية", hintNumber: 1, rank: 7 },
    endRoundRequest: null,
  };

  const btn = (active: boolean) => `rounded px-2 py-0.5 ${active ? "bg-[var(--gold)] text-black" : "bg-white/10"}`;

  return (
    <div className="relative">
      <div className="fixed inset-x-0 top-0 z-[200] flex flex-wrap items-center justify-center gap-1 bg-black/75 px-2 py-1 text-[0.68rem] text-white/80 backdrop-blur">
        <span className="opacity-70">P2:</span>
        {[0, 3, 7, 9].map((n) => (
          <button key={n} onClick={() => { setRevealedCount(n); setReveal(null); }} className={btn(revealedCount === n)}>كشف {n}</button>
        ))}
        <button onClick={() => fireReveal(Math.min(10, revealedCount + 1))} className="rounded bg-[var(--lu-ember)] px-2 py-0.5 text-black">إشعار كشف ▶</button>
        <button onClick={() => fireReveal(10)} className="rounded bg-[var(--lu-gold-1)] px-2 py-0.5 text-black">🏆 المركز 10</button>
        <button onClick={() => setTurnIsMe((v) => !v)} className="rounded bg-white/10 px-2 py-0.5">{turnIsMe ? "دوري" : "دور الخصم"}</button>
        <span className="mx-1 opacity-50">|</span>
        <button onClick={() => setHintPhase("off")} className={btn(hintPhase === "off")}>عادي</button>
        <button onClick={() => setHintPhase("countdown")} className={btn(hintPhase === "countdown")}>تلميح: عدّاد</button>
        <button onClick={() => setHintPhase("open")} className={btn(hintPhase === "open")}>تلميح: مفتوح</button>
        <button onClick={() => setMyWrong((w) => (w + 1) % 4)} className="rounded bg-white/10 px-2 py-0.5">محاولة خاطئة ({myWrong}/3)</button>
      </div>

      <TenTable
        state={state}
        meId="me"
        nickname="فهد العتيبي"
        reveal={reveal}
        onPick={(id) => console.log("pick", id)}
        onLeave={() => console.log("leave")}
        onClose={() => console.log("close")}
      />
    </div>
  );
}
