import { describe, expect, it } from "vitest";
import { evaluateRank, explainRank } from "../src/index.js";
import { card, ruleOf } from "./helpers.js";

/**
 * `explainRank` surfaces the *evidence* behind a witness — which cards satisfied
 * each leaf, and on what shared attribute/value — so the result page can say WHY
 * a rank was achieved without re-implementing rank logic. It mirrors
 * `evaluateRank`'s traversal, so evidence exists exactly when the rank holds.
 */
describe("explainRank — structured witness evidence", () => {
  it("explains a nationality PAIR: one group, the shared value, the two cards", () => {
    const pool = [card("BR", "GK", ["A"]), card("BR", "DEF", ["B"]), card("AR", "FWD", ["C"])];
    const groups = explainRank(ruleOf("PAIR"), pool);
    expect(groups).not.toBeNull();
    expect(groups).toHaveLength(1);
    expect(groups![0]!.attribute).toBe("nationality");
    expect(groups![0]!.value).toBe("BR");
    expect([...groups![0]!.cardIndices].sort()).toEqual([0, 1]);
  });

  it("explains a shared-club PAIR and tags match='shared' with the club value", () => {
    const groups = explainRank(ruleOf("PAIR"), [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
    ])!;
    expect(groups[0]!.attribute).toBe("club");
    expect(groups[0]!.match).toBe("shared");
    expect(groups[0]!.value).toBe("RM");
  });

  it("explains TWO_PAIR as two groups over disjoint cards", () => {
    const pool = [
      card("BR", "GK", ["A"]),
      card("BR", "DEF", ["B"]), // nationality pair (BR)
      card("AR", "FWD", ["X"]),
      card("EG", "FWD", ["Y"]), // position pair (FWD)
    ];
    const groups = explainRank(ruleOf("TWO_PAIR"), pool)!;
    expect(groups).toHaveLength(2);
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

  it("tags ROYAL_CLUB with match='identical' over the full five-card set", () => {
    const set = ["RM", "PSG"];
    const pool = [
      card("BR", "GK", set),
      card("AR", "DEF", set),
      card("EG", "MID", set),
      card("FR", "FWD", set),
      card("BR", "FWD", set),
    ];
    const groups = explainRank(ruleOf("ROYAL_CLUB"), pool)!;
    expect(groups[0]!.attribute).toBe("club");
    expect(groups[0]!.match).toBe("identical");
    expect(groups[0]!.cardIndices).toHaveLength(5);
  });

  it("returns null exactly when the rank does not hold (agrees with evaluateRank)", () => {
    const pool = [card("BR", "GK", ["A"]), card("AR", "DEF", ["B"])]; // nothing shared
    expect(evaluateRank(ruleOf("PAIR"), pool)).toBe(false);
    expect(explainRank(ruleOf("PAIR"), pool)).toBeNull();
  });
});
