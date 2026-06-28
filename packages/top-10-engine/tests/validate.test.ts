import { describe, expect, it } from "vitest";
import { buildAnswerList, validateRankedList, type ListPlayerMeta } from "../src/index.js";
import type { CandidateRow, RankedPlayer } from "../src/types.js";

function cands(values: number[]): CandidateRow[] {
  return values.map((v, i) => ({
    playerId: `p${i}`,
    value: v,
    appearances: 10,
    fame: 1000 - i, // unique fame → deterministic tiebreak
    name: `P${i}`,
    nameAr: `ل${i}`,
  }));
}

function fullMeta(list: readonly RankedPlayer[]): Map<string, ListPlayerMeta> {
  return new Map(list.map((p) => [p.playerId, { active: true, nameAr: p.nameAr }]));
}

describe("buildAnswerList (dense ranking, top-10 distinct values, all ties kept)", () => {
  it("assigns consecutive dense ranks to distinct values and keeps every tied player", () => {
    // values: 18,18 (rank1), 15 (rank2), 12,12 (rank3), 10,8,6,5,4,3, 2,2 (rank10), 1 (excluded)
    const { list, excludedTopValue } = buildAnswerList(
      cands([18, 18, 15, 12, 12, 10, 8, 6, 5, 4, 3, 2, 2, 1]),
    );
    const byRank = (r: number) => list.filter((p) => p.rank === r);
    expect(byRank(1)).toHaveLength(2); // tie at rank 1
    expect(byRank(2)).toHaveLength(1);
    expect(byRank(3)).toHaveLength(2); // tie at rank 3
    expect(byRank(10)).toHaveLength(2); // tie at the bottom rank
    expect(Math.max(...list.map((p) => p.rank))).toBe(10);
    expect(excludedTopValue).toBe(1); // the 11th distinct value, strictly below rank-10 (2)
    expect(validateRankedList({ list, excludedTopValue, meta: fullMeta(list) })).toEqual([]);
  });
});

describe("validateRankedList", () => {
  function good() {
    return buildAnswerList(cands([20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1]));
  }

  it("passes a clean 10-distinct-value list", () => {
    const { list, excludedTopValue } = good();
    expect(validateRankedList({ list, excludedTopValue, meta: fullMeta(list) })).toEqual([]);
  });

  it("REJECTS fewer than 10 distinct values (missing ranks)", () => {
    const { list, excludedTopValue } = buildAnswerList(cands([9, 8, 7, 6, 5, 4, 3, 2, 1])); // only 9 distinct
    const v = validateRankedList({ list, excludedTopValue, meta: fullMeta(list) });
    expect(v.some((m) => m.includes("rank 10 is missing"))).toBe(true);
  });

  it("REJECTS an incomplete bottom rank (a tied player at the 10th value excluded)", () => {
    const { list } = good();
    // pretend an excluded player ALSO has the rank-10 value (2) → tie group incomplete
    const tenth = list.find((p) => p.rank === 10)!.value;
    const v = validateRankedList({ list, excludedTopValue: tenth, meta: fullMeta(list) });
    expect(v.some((m) => m.includes("incomplete bottom rank"))).toBe(true);
  });

  it("rejects two different values sharing a rank", () => {
    const { list, excludedTopValue } = good();
    list[0]!.value = 999; // rank 1 now has a different value than its (single) member expects… force a 2nd
    const tampered = [...list, { rank: 1, playerId: "x", value: 5, fame: 1, name: "X", nameAr: "إكس" }];
    const v = validateRankedList({ list: tampered, excludedTopValue, meta: fullMeta(tampered) });
    expect(v.some((m) => m.includes("must be one value") || m.includes("different values"))).toBe(true);
  });

  it("flags missing Arabic name, inactive player, and missing row", () => {
    const { list, excludedTopValue } = good();
    const meta = fullMeta(list);
    meta.set(list[0]!.playerId, { active: true, nameAr: "  " });
    meta.set(list[1]!.playerId, { active: false, nameAr: "اسم" });
    meta.delete(list[2]!.playerId);
    const v = validateRankedList({ list, excludedTopValue, meta });
    expect(v.some((m) => m.includes("no Arabic name"))).toBe(true);
    expect(v.some((m) => m.includes("inactive"))).toBe(true);
    expect(v.some((m) => m.includes("missing from football.players"))).toBe(true);
  });

  it("flags duplicate display names and duplicate ids", () => {
    const { list, excludedTopValue } = good();
    const meta = fullMeta(list);
    meta.set(list[1]!.playerId, { active: true, nameAr: list[0]!.nameAr }); // same Arabic name
    const dupId = [...list, { ...list[0]! }]; // same id twice
    const v = validateRankedList({ list: dupId, excludedTopValue, meta: fullMeta(dupId) });
    expect(v.some((m) => m.includes("duplicate player id"))).toBe(true);
    const v2 = validateRankedList({ list, excludedTopValue, meta });
    expect(v2.some((m) => m.includes("duplicate Arabic display name"))).toBe(true);
  });
});
