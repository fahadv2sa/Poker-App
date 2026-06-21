import { describe, expect, it } from "vitest";
import { evaluateRank, explainRank } from "../src/index.js";
import { card, ruleOf } from "./helpers.js";

/**
 * `explainRank` surfaces the *evidence* behind a witness — which cards satisfied
 * each leaf, and on what shared attribute/value — so the result page can say WHY
 * a rank was achieved without re-implementing rank logic. It mirrors
 * `evaluateRank`'s traversal, so evidence exists exactly when the rank holds.
 * After the clubs-only rework, the pair/triple/full-house leaves are all club
 * groups.
 */
describe("explainRank — structured witness evidence", () => {
  it("explains a club PAIR: one group, the shared club, the two cards", () => {
    const pool = [card("BR", "GK", ["RM"]), card("AR", "DEF", ["RM"]), card("IT", "FWD", ["X"])];
    const groups = explainRank(ruleOf("PAIR"), pool);
    expect(groups).not.toBeNull();
    expect(groups).toHaveLength(1);
    expect(groups![0]!.attribute).toBe("club");
    expect(groups![0]!.value).toBe("RM");
    expect([...groups![0]!.cardIndices].sort()).toEqual([0, 1]);
  });

  it("tags the club PAIR leaf with match='shared'", () => {
    const groups = explainRank(ruleOf("PAIR"), [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
    ])!;
    expect(groups[0]!.attribute).toBe("club");
    expect(groups[0]!.match).toBe("shared");
    expect(groups[0]!.value).toBe("RM");
  });

  it("explains TWO_PAIR as two club groups over disjoint cards", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]), // club pair (RM)
      card("IT", "FWD", ["BAR"]),
      card("EG", "FWD", ["BAR"]), // club pair (BAR)
    ];
    const groups = explainRank(ruleOf("TWO_PAIR"), pool)!;
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.attribute === "club")).toBe(true);
    const indices = groups.flatMap((g) => g.cardIndices);
    expect(new Set(indices).size).toBe(indices.length); // disjoint — no card reused
  });

  it("explains LINEUP as four position groups, one per code", () => {
    const pool = [
      card("BR", "GK", []),
      card("BR", "DEF", []),
      card("BR", "MID", []),
      card("BR", "FWD", []),
    ];
    const groups = explainRank(ruleOf("LINEUP"), pool)!;
    expect(groups).toHaveLength(4);
    expect(groups.every((g) => g.attribute === "position")).toBe(true);
    expect(new Set(groups.map((g) => g.value))).toEqual(new Set(["GK", "DEF", "MID", "FWD"]));
  });

  it("tags ROYAL_CLUB with match='shared' over the full five-card set", () => {
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["RM", "JUV"]),
      card("EG", "MID", ["RM"]),
      card("FR", "FWD", ["RM", "PSG"]),
      card("BR", "FWD", ["RM", "MCI"]),
    ];
    const groups = explainRank(ruleOf("ROYAL_CLUB"), pool)!;
    expect(groups[0]!.attribute).toBe("club");
    expect(groups[0]!.match).toBe("shared");
    expect(groups[0]!.value).toBe("RM");
    expect(groups[0]!.cardIndices).toHaveLength(5);
  });

  it("returns null exactly when the rank does not hold (agrees with evaluateRank)", () => {
    const pool = [card("BR", "GK", ["A"]), card("AR", "DEF", ["B"])]; // no shared club
    expect(evaluateRank(ruleOf("PAIR"), pool)).toBe(false);
    expect(explainRank(ruleOf("PAIR"), pool)).toBeNull();
  });
});
