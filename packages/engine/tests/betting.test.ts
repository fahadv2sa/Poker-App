import { describe, expect, it } from "vitest";
import {
  applyAction,
  firstToAct,
  isHandOver,
  isRoundComplete,
  legalActions,
  openRound,
  type BettingSeat,
  type BettingState,
} from "../src/index.js";

/** Build a betting state from compact seat specs. */
function makeState(
  specs: Array<Partial<BettingSeat> & { seat: number; available: bigint }>,
  opts: Partial<BettingState> = {},
): BettingState {
  const seats: BettingSeat[] = specs.map((s) => ({
    seat: s.seat,
    status: s.status ?? "ACTIVE",
    available: s.available,
    committedThisRound: s.committedThisRound ?? 0n,
    committedTotal: s.committedTotal ?? 0n,
    lastBetAmount: s.lastBetAmount ?? 0n,
    hasActed: s.hasActed ?? false,
  }));
  return {
    seats,
    dealerSeat: opts.dealerSeat ?? 1,
    round: opts.round ?? "FLOP",
    currentBet: opts.currentBet ?? 0n,
    minRaise: opts.minRaise ?? 50n,
    currentTurnSeat: opts.currentTurnSeat ?? null,
  };
}

describe("first to act / dealer rotation (19.9)", () => {
  it("is the seat after the dealer", () => {
    const state = makeState(
      [
        { seat: 1, available: 1000n },
        { seat: 2, available: 1000n },
        { seat: 3, available: 1000n },
      ],
      { dealerSeat: 1 },
    );
    expect(firstToAct(state)).toBe(2);
  });

  it("wraps around and skips folded seats", () => {
    const state = makeState(
      [
        { seat: 1, available: 1000n },
        { seat: 2, available: 1000n, status: "FOLDED" },
        { seat: 3, available: 1000n },
      ],
      { dealerSeat: 3 },
    );
    expect(firstToAct(state)).toBe(1);
  });
});

describe("legal actions", () => {
  it("offers check (not call) when nothing is owed", () => {
    const state = openRound(
      makeState([
        { seat: 1, available: 1000n },
        { seat: 2, available: 1000n },
      ]),
      "FLOP",
    );
    const la = legalActions(state, state.currentTurnSeat!);
    expect(la.canCheck).toBe(true);
    expect(la.canCall).toBe(false);
    expect(la.minRaiseTo).toBe(50n);
  });

  it("requires a call and forbids check when facing a bet", () => {
    const state = makeState(
      [
        { seat: 1, available: 1000n, committedThisRound: 100n },
        { seat: 2, available: 1000n, committedThisRound: 0n },
      ],
      { currentBet: 100n, currentTurnSeat: 2 },
    );
    const la = legalActions(state, 2);
    expect(la.canCheck).toBe(false);
    expect(la.canCall).toBe(true);
    expect(la.callAmount).toBe(100n);
    expect(la.minRaiseTo).toBe(150n);
  });
});

describe("a betting round of checks completes", () => {
  it("closes once every active seat has acted and matched", () => {
    let state = openRound(
      makeState(
        [
          { seat: 1, available: 1000n },
          { seat: 2, available: 1000n },
          { seat: 3, available: 1000n },
        ],
        { dealerSeat: 1 },
      ),
      "FLOP",
    );
    expect(state.currentTurnSeat).toBe(2);
    state = applyAction(state, 2, { type: "CHECK" }).state;
    state = applyAction(state, 3, { type: "CHECK" }).state;
    expect(isRoundComplete(state)).toBe(false);
    state = applyAction(state, 1, { type: "CHECK" }).state;
    expect(isRoundComplete(state)).toBe(true);
    expect(state.currentTurnSeat).toBeNull();
  });
});

describe("raise reopens the round", () => {
  it("forces already-acted players to act again and tracks the chip movement", () => {
    let state = openRound(
      makeState(
        [
          { seat: 1, available: 1000n },
          { seat: 2, available: 1000n },
          { seat: 3, available: 1000n },
        ],
        { dealerSeat: 1 },
      ),
      "FLOP",
    );
    // 2 checks, 3 raises to 50, action returns to 1 and back to 2.
    state = applyAction(state, 2, { type: "CHECK" }).state;
    const raise = applyAction(state, 3, { type: "RAISE", amount: 50n });
    state = raise.state;
    expect(raise.movement).toEqual({ seat: 3, action: "RAISE", amount: 50n });
    expect(state.currentBet).toBe(50n);
    expect(isRoundComplete(state)).toBe(false);

    state = applyAction(state, 1, { type: "CALL" }).state;
    state = applyAction(state, 2, { type: "CALL" }).state;
    expect(isRoundComplete(state)).toBe(true);
  });

  it("debits exactly the call amount for the chip movement", () => {
    let state = makeState(
      [
        { seat: 1, available: 1000n, committedThisRound: 100n, hasActed: true },
        { seat: 2, available: 1000n, committedThisRound: 0n },
      ],
      { currentBet: 100n, currentTurnSeat: 2 },
    );
    const res = applyAction(state, 2, { type: "CALL" });
    expect(res.movement).toEqual({ seat: 2, action: "CALL", amount: 100n });
    const s2 = res.state.seats.find((s) => s.seat === 2)!;
    expect(s2.available).toBe(900n);
    expect(s2.committedThisRound).toBe(100n);
    expect(s2.committedTotal).toBe(100n);
  });
});

describe("all-in", () => {
  it("marks ALLIN, raises the bet when short, and reopens action", () => {
    let state = makeState(
      [
        { seat: 1, available: 1000n, committedThisRound: 100n, hasActed: true },
        { seat: 2, available: 120n, committedThisRound: 0n },
        { seat: 3, available: 1000n, committedThisRound: 100n, hasActed: true },
      ],
      { currentBet: 100n, currentTurnSeat: 2 },
    );
    const res = applyAction(state, 2, { type: "ALLIN" });
    state = res.state;
    expect(res.movement).toEqual({ seat: 2, action: "ALLIN", amount: 120n });
    const s2 = state.seats.find((s) => s.seat === 2)!;
    expect(s2.status).toBe("ALLIN");
    expect(s2.committedThisRound).toBe(120n);
    expect(state.currentBet).toBe(120n);
    // The all-in to 120 (>100) reopened action for seats 1 and 3.
    expect(state.seats.find((s) => s.seat === 1)!.hasActed).toBe(false);
    expect(state.seats.find((s) => s.seat === 3)!.hasActed).toBe(false);
  });
});

describe("fold to last player standing", () => {
  it("ends the hand when only one non-folded seat remains", () => {
    let state = openRound(
      makeState(
        [
          { seat: 1, available: 1000n },
          { seat: 2, available: 1000n },
        ],
        { dealerSeat: 1 },
      ),
      "FLOP",
    );
    expect(state.currentTurnSeat).toBe(2);
    state = applyAction(state, 2, { type: "FOLD" }).state;
    expect(isHandOver(state)).toBe(true);
    expect(state.currentTurnSeat).toBeNull();
  });
});

describe("turn order does not mutate the input state", () => {
  it("applyAction returns a new state, leaving the original untouched", () => {
    const state = openRound(
      makeState([
        { seat: 1, available: 1000n },
        { seat: 2, available: 1000n },
      ]),
      "FLOP",
    );
    const before = JSON.stringify(state, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    applyAction(state, state.currentTurnSeat!, { type: "CHECK" });
    const after = JSON.stringify(state, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(after).toBe(before);
  });
});
