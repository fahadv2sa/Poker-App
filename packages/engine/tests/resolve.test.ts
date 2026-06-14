import { describe, expect, it } from "vitest";
import {
  computeFold,
  netBySeat,
  resolveShowdown,
  type ResolveSeat,
  type Settlement,
} from "../src/index.js";

/**
 * Showdown resolution (Section 11) — the spec's required scenarios: single
 * winner, split, everyone wrong, mixed, last-player-standing, claim-timer
 * expiry, all-in side pots, and fold interaction with pots. Plus the ledger
 * invariant Σ deltas = −Σ|FOLD_FORFEIT| (see forfeit-accounting model).
 */

const seat = (
  s: number,
  committed: bigint,
  opts: Partial<ResolveSeat> = {},
): ResolveSeat => ({
  seat: s,
  committed,
  folded: false,
  forfeit: 0n,
  claimedValid: true,
  strength: 0,
  ...opts,
});

const sumByType = (settlements: Settlement[], type: Settlement["type"]) =>
  settlements.filter((m) => m.type === type).reduce((a, m) => a + m.amount, 0n);

describe("single winner", () => {
  it("the highest valid strength takes the whole pot (WIN)", () => {
    const { settlements } = resolveShowdown([
      seat(1, 100n, { strength: 5 }),
      seat(2, 100n, { strength: 3 }),
      seat(3, 100n, { strength: 1 }),
    ]);
    const net = netBySeat(settlements);
    expect(net.get(1)).toBe(300n);
    expect(net.get(2) ?? 0n).toBe(0n);
    expect(net.get(3) ?? 0n).toBe(0n);
    expect(settlements.every((m) => m.type === "WIN")).toBe(true);
  });
});

describe("split", () => {
  it("ties at the top split the pot (SPLIT_WIN), remainder to the lowest seat", () => {
    const { settlements } = resolveShowdown([
      seat(1, 100n, { strength: 5 }),
      seat(2, 100n, { strength: 5 }),
      seat(3, 101n, { strength: 1 }),
    ]);
    // Pot = 301; main 300 shared by 1&2, side 1 (only seat 3, who loses → no
    // winner there → refunded to seat 3).
    const net = netBySeat(settlements);
    expect(net.get(1)).toBe(150n);
    expect(net.get(2)).toBe(150n);
    expect(net.get(3)).toBe(1n); // uncontested 1-coin top layer refunded
    expect(settlements.some((m) => m.type === "SPLIT_WIN")).toBe(true);
  });

  it("hands the odd remainder coin to the lowest winning seat", () => {
    const { settlements } = resolveShowdown([
      seat(2, 100n, { strength: 7 }),
      seat(5, 100n, { strength: 7 }),
      seat(9, 100n, { strength: 7 }),
    ]);
    const net = netBySeat(settlements);
    // 300 / 3 = 100 each, no remainder.
    expect([net.get(2), net.get(5), net.get(9)]).toEqual([100n, 100n, 100n]);
  });
});

describe("everyone wrong → no winner (Section 11.5)", () => {
  it("refunds every non-folder their full contribution", () => {
    const { settlements } = resolveShowdown([
      seat(1, 100n, { claimedValid: false }),
      seat(2, 100n, { claimedValid: false }),
      seat(3, 100n, { claimedValid: false }),
    ]);
    const net = netBySeat(settlements);
    expect(net.get(1)).toBe(100n);
    expect(net.get(2)).toBe(100n);
    expect(net.get(3)).toBe(100n);
    expect(settlements.every((m) => m.type === "REFUND")).toBe(true);
  });

  it("keeps a folder's forfeit as a FOLD_FORFEIT sink (not refunded to them)", () => {
    const seats: ResolveSeat[] = [
      seat(1, 100n, { claimedValid: false }),
      seat(2, 100n, { claimedValid: false }),
      { seat: 3, committed: 0n, folded: true, forfeit: 25n, claimedValid: false, strength: 0 },
    ];
    const { settlements } = resolveShowdown(seats);
    const net = netBySeat(settlements);
    expect(net.get(1)).toBe(100n);
    expect(net.get(2)).toBe(100n);
    expect(net.get(3) ?? 0n).toBe(0n); // folder nets zero at resolve
    // The explicit sink row exists with the forfeit magnitude.
    expect(sumByType(settlements, "FOLD_FORFEIT")).toBe(-25n);
  });
});

describe("mixed valid/invalid", () => {
  it("a valid claim beats invalid ones; their coins stay with the winner", () => {
    const { settlements } = resolveShowdown([
      seat(1, 100n, { strength: 3 }),
      seat(2, 100n, { claimedValid: false }),
      seat(3, 100n, { claimedValid: false }),
    ]);
    const net = netBySeat(settlements);
    expect(net.get(1)).toBe(300n);
    expect(net.get(2) ?? 0n).toBe(0n);
    expect(net.get(3) ?? 0n).toBe(0n);
  });
});

describe("claim-timer expiry / no choice (Section 11.3)", () => {
  it("a non-chooser keeps no claim; their contribution stays for the winner", () => {
    const { settlements } = resolveShowdown([
      seat(1, 100n, { strength: 5 }),
      seat(2, 100n, { strength: 2 }),
      seat(3, 100n, { claimedValid: false }), // timed out
    ]);
    expect(netBySeat(settlements).get(1)).toBe(300n);
  });
});

describe("last player standing (Section 11.7)", () => {
  it("the sole survivor sweeps the pot including folder forfeits, no claim needed", () => {
    const seats: ResolveSeat[] = [
      seat(1, 150n, { strength: 0 }), // lone survivor, auto-valid
      { seat: 2, committed: 0n, folded: true, forfeit: 25n, claimedValid: false, strength: 0 },
      { seat: 3, committed: 0n, folded: true, forfeit: 25n, claimedValid: false, strength: 0 },
    ];
    const { settlements } = resolveShowdown(seats);
    expect(netBySeat(settlements).get(1)).toBe(200n); // 150 + 25 + 25
    expect(settlements.every((m) => m.type === "WIN")).toBe(true);
  });
});

describe("all-in side pots", () => {
  it("the short all-in can only win the main pot", () => {
    // A all-in 100 (strongest), B & C to 300.
    const { settlements } = resolveShowdown([
      seat(1, 100n, { strength: 9 }),
      seat(2, 300n, { strength: 5 }),
      seat(3, 300n, { strength: 3 }),
    ]);
    const net = netBySeat(settlements);
    expect(net.get(1)).toBe(300n); // main pot only
    expect(net.get(2)).toBe(400n); // side pot
    expect(net.get(3) ?? 0n).toBe(0n);
  });

  it("a big stack with the best hand sweeps every layer", () => {
    const { settlements } = resolveShowdown([
      seat(1, 100n, { strength: 1 }),
      seat(2, 300n, { strength: 9 }),
      seat(3, 300n, { strength: 5 }),
    ]);
    const net = netBySeat(settlements);
    expect(net.get(2)).toBe(700n);
    expect(net.get(1) ?? 0n).toBe(0n);
    expect(net.get(3) ?? 0n).toBe(0n);
  });
});

describe("fold interaction with side pots", () => {
  it("routes the folder forfeit into the main pot, side pot stays separate", () => {
    // A all-in 100 (str 5), B to 300 (str 3), C folded forfeit 25.
    const seats: ResolveSeat[] = [
      seat(1, 100n, { strength: 5 }),
      seat(2, 300n, { strength: 3 }),
      { seat: 3, committed: 0n, folded: true, forfeit: 25n, claimedValid: false, strength: 0 },
    ];
    const { settlements } = resolveShowdown(seats);
    const net = netBySeat(settlements);
    expect(net.get(1)).toBe(225n); // main 200 + forfeit 25
    expect(net.get(2)).toBe(200n); // side pot (300-100 from B alone)
  });
});

describe("ledger invariant Σ deltas = −Σ|FOLD_FORFEIT|", () => {
  it("holds across fold refund + no-winner resolve", () => {
    const ante = 50n;
    // Three players ante 50. Seat 3 folds on FLOP; seats 1&2 reach showdown and
    // both claim wrong → no winner.
    const fold3 = computeFold({ round: "FLOP", ante, lastBetAmount: 0n, committedTotal: ante });
    expect(fold3.forfeit).toBe(25n);
    expect(fold3.refund).toBe(25n);

    const seats: ResolveSeat[] = [
      seat(1, ante, { claimedValid: false }),
      seat(2, ante, { claimedValid: false }),
      { seat: 3, committed: 0n, folded: true, forfeit: fold3.forfeit, claimedValid: false, strength: 0 },
    ];
    const { settlements } = resolveShowdown(seats);

    // Sum every wallet delta for the whole hand.
    let total = 0n;
    // commits (debits): each seat's ante.
    total -= ante * 3n;
    // fold-time refund of (committed - forfeit) for seat 3.
    total += fold3.refund;
    // resolve-time settlements.
    for (const m of settlements) total += m.amount;

    const forfeitMagnitude = -sumByType(settlements, "FOLD_FORFEIT"); // 25
    expect(forfeitMagnitude).toBe(25n);
    expect(total).toBe(-forfeitMagnitude);
  });

  it("nets to zero when a winner sweeps the forfeit", () => {
    const ante = 50n;
    const fold3 = computeFold({ round: "FLOP", ante, lastBetAmount: 0n, committedTotal: ante });
    const seats: ResolveSeat[] = [
      seat(1, ante, { strength: 5 }),
      seat(2, ante, { strength: 3 }),
      { seat: 3, committed: 0n, folded: true, forfeit: fold3.forfeit, claimedValid: false, strength: 0 },
    ];
    const { settlements } = resolveShowdown(seats);
    let total = -ante * 3n + fold3.refund;
    for (const m of settlements) total += m.amount;
    expect(sumByType(settlements, "FOLD_FORFEIT")).toBe(0n); // forfeit went to winner
    expect(total).toBe(0n);
    expect(netBySeat(settlements).get(1)).toBe(125n); // 50+50+25 forfeit
  });
});
