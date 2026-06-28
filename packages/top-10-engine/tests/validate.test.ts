import { describe, expect, it } from "vitest";
import { buildRankingWithExcluded, validateRankedList, type ListPlayerMeta } from "../src/index.js";
import type { CandidateRow, RankedPlayer } from "../src/types.js";

/** Build a valid 10-player list with strictly-decreasing values and distinct names. */
function goodList(): RankedPlayer[] {
  return Array.from({ length: 10 }, (_, i) => ({
    rank: i + 1,
    playerId: `p${i + 1}`,
    value: 100 - i, // strictly decreasing
    fame: 50 - i,
    name: `P${i + 1}`,
    nameAr: `لاعب${i + 1}`,
  }));
}

function fullMeta(list: RankedPlayer[]): Map<string, ListPlayerMeta> {
  return new Map(list.map((p) => [p.playerId, { active: true, nameAr: p.nameAr }]));
}

describe("validateRankedList", () => {
  it("passes a clean list (distinct decreasing values, active players, distinct Arabic names)", () => {
    const list = goodList();
    expect(validateRankedList({ list, eleventhValue: 90, meta: fullMeta(list) })).toEqual([]);
  });

  it("REJECTS a boundary tie (10th value equals the 11th)", () => {
    const list = goodList();
    list[9]!.value = 91; // 10th value
    const v = validateRankedList({ list, eleventhValue: 91, meta: fullMeta(list) });
    expect(v.some((m) => m.includes("boundary tie"))).toBe(true);
  });

  it("accepts when the 10th value is strictly greater than the 11th", () => {
    const list = goodList();
    list[9]!.value = 91;
    expect(validateRankedList({ list, eleventhValue: 90, meta: fullMeta(list) })).toEqual([]);
  });

  it("flags a missing Arabic name, an inactive player, and a missing row", () => {
    const list = goodList();
    const meta = fullMeta(list);
    meta.set("p1", { active: true, nameAr: "   " }); // blank
    meta.set("p2", { active: false, nameAr: "لاعب2" }); // inactive
    meta.delete("p3"); // missing from football.players
    const v = validateRankedList({ list, eleventhValue: 90, meta });
    expect(v.some((m) => m.includes("no Arabic name"))).toBe(true);
    expect(v.some((m) => m.includes("inactive"))).toBe(true);
    expect(v.some((m) => m.includes("missing from football.players"))).toBe(true);
  });

  it("flags duplicate Arabic display names in the list", () => {
    const list = goodList();
    list[1]!.nameAr = list[0]!.nameAr; // two cards same name
    const meta = fullMeta(list);
    const v = validateRankedList({ list, eleventhValue: 90, meta });
    expect(v.some((m) => m.includes("duplicate Arabic display name"))).toBe(true);
  });

  it("flags non-decreasing values and non-positive values", () => {
    const list = goodList();
    list[5]!.value = list[4]!.value + 5; // rank 6 > rank 5
    list[9]!.value = 0; // non-positive
    const meta = fullMeta(list);
    const v = validateRankedList({ list, eleventhValue: null, meta });
    expect(v.some((m) => m.includes("> previous rank"))).toBe(true);
    expect(v.some((m) => m.includes("positive finite"))).toBe(true);
  });

  it("buildRankingWithExcluded exposes the 11th value for the boundary check", () => {
    const rows: CandidateRow[] = Array.from({ length: 12 }, (_, i) => ({
      playerId: `p${i}`,
      value: 20 - i,
      appearances: 10,
      fame: 1,
      name: `P${i}`,
      nameAr: `ل${i}`,
    }));
    const { list, eleventhValue } = buildRankingWithExcluded(rows);
    expect(list).toHaveLength(10);
    expect(list[9]!.value).toBe(11); // 20-9
    expect(eleventhValue).toBe(10); // 20-10 (the 11th)
  });
});
