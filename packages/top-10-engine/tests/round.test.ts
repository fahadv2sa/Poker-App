import { describe, it, expect } from "vitest";
import {
  initRound,
  currentTurnSeat,
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

describe("normal turn mode", () => {
  it("rotates turns and a correct guess reveals + scores + resets the counter", () => {
    let s = initRound([0, 1]);
    expect(currentTurnSeat(s)).toBe(0);
    const r = normalGuess(s, 0, { type: "correct", rank: 10 });
    s = r.state;
    expect(r.events.some((e) => e.t === "reveal" && e.rank === 10 && e.points === 10)).toBe(true);
    expect(s.noCorrectRotations).toBe(0);
    expect(currentTurnSeat(s)).toBe(1); // turn advanced
  });

  it("a wrong guess loses the turn immediately", () => {
    let s = initRound([0, 1]);
    s = normalGuess(s, 0, { type: "wrong" }).state;
    expect(currentTurnSeat(s)).toBe(1);
  });

  it("guessing an already-revealed player: no penalty, keep the turn", () => {
    let s = initRound([0, 1]);
    const r = normalGuess(s, 0, { type: "already" });
    expect(currentTurnSeat(r.state)).toBe(0);
    expect(r.events).toHaveLength(0);
  });

  it("ignores a guess from a seat that is not on turn", () => {
    const s = initRound([0, 1]);
    const r = normalGuess(s, 1, { type: "correct", rank: 5 });
    expect(r.state).toBe(s); // unchanged
  });

  it("two full rotations with zero correct → switch to HINT mode", () => {
    let s = initRound([0, 1]);
    // rotation 1
    s = normalTimeout(s, 0).state;
    s = normalTimeout(s, 1).state;
    expect(s.noCorrectRotations).toBe(1);
    expect(s.mode).toBe("NORMAL");
    // rotation 2
    s = normalTimeout(s, 0).state;
    const r = normalTimeout(s, 1);
    s = r.state;
    expect(s.noCorrectRotations).toBe(2);
    expect(s.mode).toBe("HINT");
    expect(r.events.some((e) => e.t === "modeSwitched")).toBe(true);
  });

  it("a correct guess mid-drought resets rotations away from the trigger", () => {
    let s = initRound([0, 1]);
    s = normalTimeout(s, 0).state;
    s = normalTimeout(s, 1).state; // noCorrectRotations = 1
    s = normalGuess(s, 0, { type: "correct", rank: 1 }).state;
    expect(s.noCorrectRotations).toBe(0);
  });

  it("revealing the last hidden card ends the round (ALL_REVEALED)", () => {
    let s = initRound([0, 1]);
    // reveal ranks 1..10 alternating seats
    for (let rank = 1; rank <= 10; rank++) {
      const seat = currentTurnSeat(s)!;
      s = normalGuess(s, seat, { type: "correct", rank }).state;
    }
    expect(s.done).toBe(true);
    expect(s.endReason).toBe("ALL_REVEALED");
    expect(s.hidden).toHaveLength(0);
  });
});

describe("hint / fastest-answer mode", () => {
  function enterHint(): RoundState {
    let s = initRound([0, 1]);
    s = normalTimeout(s, 0).state;
    s = normalTimeout(s, 1).state;
    s = normalTimeout(s, 0).state;
    s = normalTimeout(s, 1).state;
    expect(s.mode).toBe("HINT");
    return s;
  }

  it("runs countdown → hint → correct target solves the card", () => {
    let s = enterHint();
    s = beginHintCard(s, 4).state;
    expect(s.hint?.phase).toBe("COUNTDOWN");
    s = revealHint(s).state;
    expect(s.hint?.phase).toBe("OPEN");
    expect(s.hint?.hintsGiven).toBe(1);
    const r = hintGuess(s, 0, { type: "correct", rank: 4 });
    s = r.state;
    expect(r.events.some((e) => e.t === "reveal" && e.rank === 4 && e.points === 4)).toBe(true);
    expect(s.hint).toBeNull(); // target solved → move to next card
  });

  it("a DIFFERENT correct hidden player still scores; hint stays on its target", () => {
    let s = enterHint();
    s = beginHintCard(s, 4).state;
    s = revealHint(s).state;
    const r = hintGuess(s, 1, { type: "correct", rank: 9 });
    s = r.state;
    expect(r.events.some((e) => e.t === "reveal" && e.rank === 9)).toBe(true);
    expect(s.hint?.targetRank).toBe(4); // unchanged
    expect(s.hint?.phase).toBe("OPEN"); // window continues
  });

  it("three wrong attempts lock a player's input for the round", () => {
    let s = enterHint();
    s = beginHintCard(s, 4).state;
    s = revealHint(s).state;
    s = hintGuess(s, 0, { type: "wrong" }).state;
    s = hintGuess(s, 0, { type: "wrong" }).state;
    const r = hintGuess(s, 0, { type: "wrong" });
    s = r.state;
    expect(s.lockedSeats).toContain(0);
    expect(r.events.some((e) => e.t === "seatLocked" && e.seat === 0)).toBe(true);
    // further guesses from a locked seat are ignored
    const after = hintGuess(s, 0, { type: "correct", rank: 4 });
    expect(after.state).toBe(s);
  });

  it("window expiry re-hints up to 3, then auto-reveals with 0 points", () => {
    let s = enterHint();
    s = beginHintCard(s, 7).state;
    // hint 1
    s = revealHint(s).state;
    s = hintWindowTimeout(s).state; // back to COUNTDOWN, hint stays
    expect(s.hint?.hintsGiven).toBe(1);
    // hint 2
    s = revealHint(s).state;
    s = hintWindowTimeout(s).state;
    expect(s.hint?.hintsGiven).toBe(2);
    // hint 3
    s = revealHint(s).state;
    const r = hintWindowTimeout(s); // 3rd expired → auto-reveal
    s = r.state;
    expect(r.events.some((e) => e.t === "hintCardAutoRevealed" && e.rank === 7)).toBe(true);
    expect(s.reveals.find((x) => x.rank === 7)!.points).toBe(0);
    expect(s.reveals.find((x) => x.rank === 7)!.bySeat).toBeNull();
    expect(s.hint).toBeNull();
  });
});

describe("scoring accumulation", () => {
  it("scoreBySeat and revealedRanksBySeat reflect who revealed what", () => {
    let s = initRound([0, 1]);
    s = normalGuess(s, 0, { type: "correct", rank: 10 }).state; // seat0 +10
    s = normalGuess(s, 1, { type: "correct", rank: 3 }).state; // seat1 +3
    s = normalGuess(s, 0, { type: "correct", rank: 8 }).state; // seat0 +8
    expect(scoreBySeat(s)).toEqual({ 0: 18, 1: 3 });
    expect(revealedRanksBySeat(s)).toEqual({ 0: [10, 8], 1: [3] });
  });
});
