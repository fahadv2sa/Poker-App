import { describe, it, expect } from "vitest";
import { buildRanking, compareArabic } from "../src/index.js";
import type { CandidateRow } from "../src/index.js";

const row = (p: Partial<CandidateRow> & { playerId: string }): CandidateRow => ({
  value: 0,
  appearances: 30,
  fame: 50,
  name: p.playerId,
  nameAr: p.playerId,
  ...p,
});

describe("buildRanking", () => {
  it("orders by value desc and assigns ranks 1..10", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ playerId: `p${i}`, value: 12 - i }),
    );
    const ranked = buildRanking(rows);
    expect(ranked).toHaveLength(10);
    expect(ranked[0]!.value).toBe(12);
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[9]!.rank).toBe(10);
    expect(ranked[9]!.value).toBe(3);
  });

  it("tie-break 1: higher fame ranks higher on equal value", () => {
    const rows = [
      row({ playerId: "low", value: 10, fame: 40 }),
      row({ playerId: "high", value: 10, fame: 90 }),
    ];
    const ranked = buildRanking(rows);
    expect(ranked[0]!.playerId).toBe("high");
  });

  it("tie-break 2: equal value AND fame → Arabic alphabetical", () => {
    const rows = [
      row({ playerId: "b", value: 10, fame: 50, nameAr: "بـ" }),
      row({ playerId: "a", value: 10, fame: 50, nameAr: "اـ" }),
    ];
    const ranked = buildRanking(rows);
    // ألف (ا) sorts before باء (ب)
    expect(ranked[0]!.nameAr).toBe("اـ");
  });

  it("excludes zero/null-value players from the list", () => {
    const rows = [
      row({ playerId: "scorer", value: 5 }),
      row({ playerId: "zero", value: 0 }),
      row({ playerId: "nullv", value: null }),
    ];
    const ranked = buildRanking(rows);
    expect(ranked.map((r) => r.playerId)).toEqual(["scorer"]);
  });
});

describe("compareArabic", () => {
  it("sorts Arabic letters in order", () => {
    expect(compareArabic("ا", "ب")).toBeLessThan(0);
    expect(compareArabic("ي", "ا")).toBeGreaterThan(0);
  });
});
