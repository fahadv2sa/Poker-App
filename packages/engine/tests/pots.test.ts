import { describe, expect, it } from "vitest";
import { buildSidePots, totalPot, type PotSeat } from "../src/index.js";

const active = (seat: number, committed: bigint): PotSeat => ({
  seat,
  committed,
  folded: false,
  forfeit: 0n,
});
const folder = (seat: number, forfeit: bigint): PotSeat => ({
  seat,
  committed: 0n,
  folded: true,
  forfeit,
});

/** Layered side pots (Section 9.2 / 9.5). */
describe("buildSidePots", () => {
  it("makes a single pot when everyone contributed equally", () => {
    const pots = buildSidePots([active(1, 100n), active(2, 100n), active(3, 100n)]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(300n);
    expect(pots[0]!.eligibleSeats.sort()).toEqual([1, 2, 3]);
  });

  it("layers an all-in below two larger stacks", () => {
    // A all-in 100, B & C to 300.
    const pots = buildSidePots([active(1, 100n), active(2, 300n), active(3, 300n)]);
    expect(pots).toHaveLength(2);
    // Main pot: 100 from each of the three.
    expect(pots[0]!.amount).toBe(300n);
    expect(pots[0]!.eligibleSeats.sort()).toEqual([1, 2, 3]);
    // Side pot: 200 more from B and C only.
    expect(pots[1]!.amount).toBe(400n);
    expect(pots[1]!.eligibleSeats.sort()).toEqual([2, 3]);
    expect(totalPot(pots)).toBe(700n);
  });

  it("builds three layers for three distinct all-in levels", () => {
    const pots = buildSidePots([active(1, 50n), active(2, 150n), active(3, 300n)]);
    expect(pots.map((p) => p.amount)).toEqual([150n, 200n, 150n]);
    expect(pots[0]!.eligibleSeats.sort()).toEqual([1, 2, 3]);
    expect(pots[1]!.eligibleSeats.sort()).toEqual([2, 3]);
    expect(pots[2]!.eligibleSeats).toEqual([3]);
    expect(totalPot(pots)).toBe(500n);
  });

  it("adds folder forfeits to the main pot only (Section 9.5)", () => {
    const pots = buildSidePots([
      active(1, 100n),
      active(2, 300n),
      active(3, 300n),
      folder(4, 25n),
    ]);
    expect(pots).toHaveLength(2);
    expect(pots[0]!.amount).toBe(325n); // 300 + 25 forfeit
    expect(pots[0]!.forfeit).toBe(25n);
    expect(pots[1]!.amount).toBe(400n); // side pot untouched by the forfeit
    expect(pots[1]!.forfeit).toBe(0n);
    expect(totalPot(pots)).toBe(725n);
  });

  it("records perSeat as the layer's per-eligible contribution", () => {
    const pots = buildSidePots([active(1, 100n), active(2, 300n), active(3, 300n)]);
    expect(pots[0]!.perSeat).toBe(100n);
    expect(pots[1]!.perSeat).toBe(200n);
  });
});
