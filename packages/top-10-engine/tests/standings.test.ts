import { describe, it, expect } from "vitest";
import { finalStandings, compareRevealedRanks } from "../src/index.js";

describe("final standings", () => {
  it("orders by points first", () => {
    const rows = finalStandings([
      { userId: "a", points: 20, revealedRanks: [1, 2] },
      { userId: "b", points: 35, revealedRanks: [5] },
    ]);
    expect(rows[0]!.userId).toBe("b");
    expect(rows[0]!.place).toBe(1);
  });

  it("tie on points → higher revealed rank wins (poker high-card)", () => {
    // both 18 points; A revealed a 10, B's best is 9 → A wins
    const rows = finalStandings([
      { userId: "a", points: 18, revealedRanks: [10, 8] },
      { userId: "b", points: 18, revealedRanks: [9, 9] },
    ]);
    expect(rows[0]!.userId).toBe("a");
    expect(rows[0]!.tiedWithPrev).toBe(false);
  });

  it("identical points AND ranks → declared tie", () => {
    const rows = finalStandings([
      { userId: "a", points: 18, revealedRanks: [10, 8] },
      { userId: "b", points: 18, revealedRanks: [8, 10] },
    ]);
    expect(rows[1]!.tiedWithPrev).toBe(true);
    expect(rows[0]!.place).toBe(rows[1]!.place);
  });

  it("compareRevealedRanks: more cards wins at equal depth", () => {
    // [10,5] vs [10] → first ties on 10, then 5 vs none → [10,5] better
    expect(compareRevealedRanks([10, 5], [10])).toBeLessThan(0);
  });
});
