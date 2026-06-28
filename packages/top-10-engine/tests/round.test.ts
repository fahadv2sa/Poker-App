import { describe, it, expect } from "vitest";
import {
  initRound,
  currentTurnSeat,
  hiddenCount,
  normalGuess,
  normalTimeout,
  beginHintCard,
  revealHint,
  hintGuess,
  hintWindowTimeout,
  scoreBySeat,
  revealedRanksBySeat,
  type RoundState,
} from "../src/index.js";

/** 10 distinct values, ranks 1..10, players "p1".."p10". p{r} has rank r. */
function tenList() {
  return Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i + 1}`, value: 100 - i, rank: i + 1 }));
}
const lastReveal = (r: { events: { t: string }[] }) =>
  r.events.filter((e) => e.t === "reveal").at(-1) as
    | { t: "reveal"; playerId: string; rank: number; points: number; bonus: boolean }
    | undefined;

describe("normal turn mode", () => {
  it("a correct guess (by playerId) reveals + scores + advances the turn", () => {
    let s = initRound([0, 1], 0, tenList());
    expect(currentTurnSeat(s)).toBe(0);
    const r = normalGuess(s, 0, "p10"); // rank 10 → 10 points
    s = r.state;
    expect(lastReveal(r)).toMatchObject({ playerId: "p10", rank: 10, points: 10, bonus: false });
    expect(currentTurnSeat(s)).toBe(1);
  });

  it("a wrong guess (not in the list) loses the turn", () => {
    let s = initRound([0, 1], 0, tenList());
    s = normalGuess(s, 0, "nobody").state;
    expect(currentTurnSeat(s)).toBe(1);
  });

  it("guessing an already-revealed player: no penalty, keep the turn", () => {
    let s = initRound([0, 1], 0, tenList());
    s = normalGuess(s, 0, "p5").state; // seat0 reveals p5, turn → seat1
    s = normalGuess(s, 1, "p6").state; // seat1 reveals p6, turn → seat0
    const r = normalGuess(s, 0, "p5"); // already revealed
    expect(currentTurnSeat(r.state)).toBe(0);
    expect(r.events).toHaveLength(0);
  });

  it("ignores a guess from a seat that is not on turn", () => {
    const s = initRound([0, 1], 0, tenList());
    const r = normalGuess(s, 1, "p3");
    expect(r.state).toBe(s);
  });

  it("two full rotations with zero correct → HINT mode", () => {
    let s = initRound([0, 1], 0, tenList());
    s = normalTimeout(s, 0).state;
    s = normalTimeout(s, 1).state;
    expect(s.noCorrectRotations).toBe(1);
    s = normalTimeout(s, 0).state;
    const r = normalTimeout(s, 1);
    expect(r.state.mode).toBe("HINT");
    expect(r.events.some((e) => e.t === "modeSwitched")).toBe(true);
  });

  it("revealing the last hidden card ends the round (ALL_REVEALED)", () => {
    let s = initRound([0, 1], 0, tenList());
    for (let i = 1; i <= 10; i++) {
      const seat = currentTurnSeat(s)!;
      s = normalGuess(s, seat, `p${i}`).state;
    }
    expect(s.done).toBe(true);
    expect(s.endReason).toBe("ALL_REVEALED");
    expect(hiddenCount(s)).toBe(0);
  });
});

describe("tie cascade", () => {
  // rank 1 tie {A,B}@100, then C@90 (rank2), D@80 (rank3).
  const cascadeList = () => [
    { playerId: "A", value: 100, rank: 1 },
    { playerId: "B", value: 100, rank: 1 },
    { playerId: "C", value: 90, rank: 2 },
    { playerId: "D", value: 80, rank: 3 },
  ];

  it("first-named takes the top rank; the rest cascade down and shift everyone below", () => {
    let s = initRound([0, 1], 0, cascadeList());
    const rA = normalGuess(s, 0, "A"); // first of the rank-1 tie
    s = rA.state;
    expect(lastReveal(rA)).toMatchObject({ playerId: "A", rank: 1, points: 1 });

    const rB = normalGuess(s, 1, "B"); // tied → cascades to rank 2
    s = rB.state;
    expect(lastReveal(rB)).toMatchObject({ playerId: "B", rank: 2, points: 2, bonus: false });

    // C (was rank 2) shifted down to rank 3; D (was 3) → 4.
    const seatC = currentTurnSeat(s)!;
    const rC = normalGuess(s, seatC, "C");
    expect(lastReveal(rC)).toMatchObject({ playerId: "C", rank: 3 });
    const seatD = currentTurnSeat(rC.state)!;
    const rD = normalGuess(rC.state, seatD, "D");
    expect(lastReveal(rD)).toMatchObject({ playerId: "D", rank: 4 });
  });
});

describe("tie → bonus (cascade blocked by a revealed card below)", () => {
  // rank 1 tie {S,P,M}@80, then Bruno@60 (rank 2).
  const bonusList = () => [
    { playerId: "S", value: 80, rank: 1 },
    { playerId: "P", value: 80, rank: 1 },
    { playerId: "M", value: 80, rank: 1 },
    { playerId: "Bruno", value: 60, rank: 2 },
  ];

  it("a revealed card below turns the remaining tied players into bonus cards at their rank", () => {
    let s = initRound([0, 1], 0, bonusList());
    s = normalGuess(s, 0, "Bruno").state; // reveal the lower card FIRST (rank 2)
    const rP = normalGuess(s, currentTurnSeat(s)!, "P"); // first of the tie → rank 1
    s = rP.state;
    expect(lastReveal(rP)).toMatchObject({ playerId: "P", rank: 1, bonus: false });

    // S and M are now BONUS at rank 1 (cascade blocked by Bruno below).
    const rS = normalGuess(s, currentTurnSeat(s)!, "S");
    expect(lastReveal(rS)).toMatchObject({ playerId: "S", rank: 1, points: 1, bonus: true });
    const rM = normalGuess(rS.state, currentTurnSeat(rS.state)!, "M");
    expect(lastReveal(rM)).toMatchObject({ playerId: "M", rank: 1, points: 1, bonus: true });

    // round ends only once ALL (incl. bonus) are revealed
    expect(rM.state.done).toBe(true);
    expect(rM.state.endReason).toBe("ALL_REVEALED");
  });
});

describe("hint / fastest-answer mode", () => {
  function enterHint(): RoundState {
    let s = initRound([0, 1], 0, tenList());
    s = normalTimeout(s, 0).state;
    s = normalTimeout(s, 1).state;
    s = normalTimeout(s, 0).state;
    s = normalTimeout(s, 1).state;
    expect(s.mode).toBe("HINT");
    return s;
  }

  it("countdown → hint → naming the target solves the card", () => {
    let s = enterHint();
    s = beginHintCard(s, "p4").state;
    expect(s.hint?.phase).toBe("COUNTDOWN");
    s = revealHint(s).state;
    expect(s.hint?.phase).toBe("OPEN");
    const r = hintGuess(s, 0, "p4");
    expect(lastReveal(r)).toMatchObject({ playerId: "p4", rank: 4 });
    expect(r.state.hint).toBeNull(); // target solved → next card
  });

  it("a DIFFERENT correct player still scores; the hint stays on its target", () => {
    let s = enterHint();
    s = beginHintCard(s, "p4").state;
    s = revealHint(s).state;
    const r = hintGuess(s, 1, "p9");
    expect(lastReveal(r)).toMatchObject({ playerId: "p9", rank: 9 });
    expect(r.state.hint?.targetPlayerId).toBe("p4");
    expect(r.state.hint?.phase).toBe("OPEN");
  });

  it("three wrong attempts lock a seat", () => {
    let s = enterHint();
    s = beginHintCard(s, "p4").state;
    s = revealHint(s).state;
    s = hintGuess(s, 0, "nobody").state;
    s = hintGuess(s, 0, "nobody").state;
    const r = hintGuess(s, 0, "nobody");
    expect(r.state.lockedSeats).toContain(0);
    expect(hintGuess(r.state, 0, "p4").state).toBe(r.state); // locked → ignored
  });

  it("window expiry re-hints up to 3, then auto-reveals the target with 0 points", () => {
    let s = enterHint();
    s = beginHintCard(s, "p7").state;
    s = revealHint(s).state;
    s = hintWindowTimeout(s).state;
    s = revealHint(s).state;
    s = hintWindowTimeout(s).state;
    s = revealHint(s).state;
    const r = hintWindowTimeout(s);
    expect(r.events.some((e) => e.t === "hintCardAutoRevealed" && e.playerId === "p7")).toBe(true);
    const rec = r.state.reveals.find((x) => x.playerId === "p7")!;
    expect(rec.points).toBe(0);
    expect(rec.bySeat).toBeNull();
  });
});

describe("scoring accumulation", () => {
  it("scoreBySeat and revealedRanksBySeat reflect who revealed what", () => {
    let s = initRound([0, 1], 0, tenList());
    s = normalGuess(s, 0, "p10").state; // seat0 +10
    s = normalGuess(s, 1, "p3").state; // seat1 +3
    s = normalGuess(s, 0, "p8").state; // seat0 +8
    expect(scoreBySeat(s)).toEqual({ 0: 18, 1: 3 });
    expect(revealedRanksBySeat(s)).toEqual({ 0: [10, 8], 1: [3] });
  });
});
