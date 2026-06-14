import { describe, expect, it } from "vitest";
import { computeFold } from "../src/index.js";

/**
 * Fold accounting (Section 10 / 19.3): forfeit half the ante on PREFLOP/FLOP,
 * half the last bet on TURN/RIVER; the rest is refunded.
 */
describe("computeFold", () => {
  it("FLOP forfeits half the ante, refunds the rest of the contribution", () => {
    // Paid ante 50 + bet 100 = committed 150; forfeit = ante/2 = 25.
    const r = computeFold({ round: "FLOP", ante: 50n, lastBetAmount: 100n, committedTotal: 150n });
    expect(r.forfeit).toBe(25n);
    expect(r.refund).toBe(125n);
  });

  it("PREFLOP is anchored to the ante like FLOP", () => {
    const r = computeFold({ round: "PREFLOP", ante: 50n, lastBetAmount: 0n, committedTotal: 50n });
    expect(r.forfeit).toBe(25n);
    expect(r.refund).toBe(25n);
  });

  it("TURN forfeits half the last bet", () => {
    const r = computeFold({ round: "TURN", ante: 50n, lastBetAmount: 200n, committedTotal: 350n });
    expect(r.forfeit).toBe(100n);
    expect(r.refund).toBe(250n);
  });

  it("RIVER forfeits half the last bet", () => {
    const r = computeFold({ round: "RIVER", ante: 50n, lastBetAmount: 80n, committedTotal: 500n });
    expect(r.forfeit).toBe(40n);
    expect(r.refund).toBe(460n);
  });

  it("floors the half on odd amounts", () => {
    const r = computeFold({ round: "TURN", ante: 50n, lastBetAmount: 75n, committedTotal: 100n });
    expect(r.forfeit).toBe(37n); // floor(75/2)
    expect(r.refund).toBe(63n);
  });

  it("never forfeits more than what is in the pot", () => {
    const r = computeFold({ round: "TURN", ante: 50n, lastBetAmount: 500n, committedTotal: 100n });
    expect(r.forfeit).toBe(100n);
    expect(r.refund).toBe(0n);
  });
});
