import { describe, expect, it } from "vitest";
import { buildAnswerList, validateRankedList, type ListPlayerMeta } from "../src/index.js";
import type { CandidateRow, RankedPlayer } from "../src/types.js";

/** A valid 10-player list: strictly-decreasing values, distinct names. */
function goodList(): RankedPlayer[] {
  return Array.from({ length: 10 }, (_, i) => ({
    rank: i + 1,
    playerId: `p${i + 1}`,
    value: 100 - i,
    fame: 50 - i,
    name: `P${i + 1}`,
    nameAr: `لاعب${i + 1}`,
  }));
}

function fullMeta(list: RankedPlayer[]): Map<string, ListPlayerMeta> {
  return new Map(list.map((p) => [p.playerId, { active: true, nameAr: p.nameAr }]));
}

function candidates(values: number[]): CandidateRow[] {
  return values.map((v, i) => ({
    playerId: `p${i}`,
    value: v,
    appearances: 10,
    fame: 1000 - i, // unique fame so tiebreak is deterministic
    name: `P${i}`,
    nameAr: `ل${i}`,
  }));
}

describe("validateRankedList", () => {
  it("passes a clean strictly-decreasing list", () => {
    const list = goodList();
    expect(validateRankedList({ list, excludedTopValue: 90, meta: fullMeta(list) })).toEqual([]);
  });

  it("ACCEPTS a cutoff tie when the whole tie group is included (multi rank-10)", () => {
    // 9 distinct + three players tied at rank 10 (value 12)
    const list: RankedPlayer[] = [
      ...Array.from({ length: 9 }, (_, i) => ({
        rank: i + 1, playerId: `p${i}`, value: 30 - i, fame: 9 - i, name: `P${i}`, nameAr: `ل${i}`,
      })),
      { rank: 10, playerId: "t1", value: 12, fame: 5, name: "T1", nameAr: "تي1" },
      { rank: 10, playerId: "t2", value: 12, fame: 4, name: "T2", nameAr: "تي2" },
      { rank: 10, playerId: "t3", value: 12, fame: 3, name: "T3", nameAr: "تي3" },
    ];
    const meta = fullMeta(list);
    // best excluded is strictly below the cutoff (11) → complete tie group
    expect(validateRankedList({ list, excludedTopValue: 11, meta })).toEqual([]);
  });

  it("REJECTS an INCOMPLETE cutoff tie (a tied player was excluded)", () => {
    const list = goodList();
    list[9]!.value = 12; // rank 10 value
    const meta = fullMeta(list);
    // an excluded player ALSO has value 12 → tie group incomplete → must reject
    const v = validateRankedList({ list, excludedTopValue: 12, meta });
    expect(v.some((m) => m.includes("incomplete cutoff tie"))).toBe(true);
  });

  it("rejects a non-cutoff rank that is shared by >1 player", () => {
    const list = goodList();
    list[5]!.rank = 5; // now two players at rank 5, and rank 6 missing
    const v = validateRankedList({ list, excludedTopValue: 90, meta: fullMeta(list) });
    expect(v.some((m) => m.includes("only the cutoff rank"))).toBe(true);
    expect(v.some((m) => m.includes("rank 6 is missing"))).toBe(true);
  });

  it("flags missing Arabic name, inactive player, and missing row", () => {
    const list = goodList();
    const meta = fullMeta(list);
    meta.set("p1", { active: true, nameAr: "   " });
    meta.set("p2", { active: false, nameAr: "لاعب2" });
    meta.delete("p3");
    const v = validateRankedList({ list, excludedTopValue: 90, meta });
    expect(v.some((m) => m.includes("no Arabic name"))).toBe(true);
    expect(v.some((m) => m.includes("inactive"))).toBe(true);
    expect(v.some((m) => m.includes("missing from football.players"))).toBe(true);
  });

  it("flags duplicate Arabic display names and duplicate ids", () => {
    const list = goodList();
    list[1]!.nameAr = list[0]!.nameAr;
    list[2]!.playerId = list[0]!.playerId;
    const v = validateRankedList({ list, excludedTopValue: 90, meta: fullMeta(list) });
    expect(v.some((m) => m.includes("duplicate Arabic display name"))).toBe(true);
    expect(v.some((m) => m.includes("duplicate player id"))).toBe(true);
  });
});

describe("buildAnswerList", () => {
  it("returns exactly 10 with a strict cutoff (no tie)", () => {
    const { list, excludedTopValue } = buildAnswerList(candidates([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9]));
    expect(list).toHaveLength(10);
    expect(Math.max(...list.map((p) => p.rank))).toBe(10);
    expect(list.filter((p) => p.rank === 10)).toHaveLength(1);
    expect(excludedTopValue).toBe(10); // 11th value, strictly below the cutoff 11
  });

  it("INCLUDES the whole cutoff tie group at rank 10 (restores the question)", () => {
    // 9th value (11) is strictly above the cutoff (10) → every player tied at 10 is rank 10.
    const { list, excludedTopValue } = buildAnswerList(
      candidates([20, 19, 18, 17, 16, 15, 14, 13, 11, 10, 10, 10, 9]),
    );
    const rank10 = list.filter((p) => p.rank === 10);
    expect(rank10).toHaveLength(3); // all three 10s are valid rank-10 answers
    expect(rank10.every((p) => p.value === 10)).toBe(true);
    expect(list.filter((p) => p.rank < 10)).toHaveLength(9); // ranks 1..9 distinct
    expect(excludedTopValue).toBe(9); // strictly below the cutoff 10 → tie group complete
    const meta = new Map(list.map((p) => [p.playerId, { active: true, nameAr: p.nameAr } as ListPlayerMeta]));
    expect(validateRankedList({ list, excludedTopValue, meta })).toEqual([]);
  });

  it("edge: when the cutoff value reaches into the top 9, ranks 1..10 stay intact and all tied players are still included (0% error)", () => {
    // four 12s spanning positions 9..12. One sits at rank 9, the rest at rank 10 —
    // every tied player is still in the list (a valid answer), and the list still
    // passes the validator (no tied player excluded).
    const { list, excludedTopValue } = buildAnswerList(
      candidates([20, 19, 18, 17, 16, 15, 14, 13, 12, 12, 12, 12, 9]),
    );
    expect(list.filter((p) => p.value === 12)).toHaveLength(4); // all four tied players included
    expect(Math.max(...list.map((p) => p.rank))).toBe(10); // ranks 1..10 intact
    const meta = new Map(list.map((p) => [p.playerId, { active: true, nameAr: p.nameAr } as ListPlayerMeta]));
    expect(validateRankedList({ list, excludedTopValue, meta })).toEqual([]);
  });
});
