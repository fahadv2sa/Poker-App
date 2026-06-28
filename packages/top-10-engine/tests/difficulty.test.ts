import { describe, it, expect } from "vitest";
import { computeThresholds, classifyDifficulty, percentile } from "../src/index.js";

describe("difficulty tiering (terciles, inverse)", () => {
  it("splits a uniform distribution into ~thirds", () => {
    const sums = Array.from({ length: 99 }, (_, i) => i + 1); // 1..99
    const t = computeThresholds(sums);
    expect(t.hardMaxSum).toBeCloseTo(percentile(sums, 1 / 3), 5);
    expect(t.easyMinSum).toBeCloseTo(percentile(sums, 2 / 3), 5);

    const tiers = sums.map((s) => classifyDifficulty(s, t));
    const counts = tiers.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
    // each bucket roughly a third
    for (const k of ["EASY", "MEDIUM", "HARD"]) {
      expect(counts[k]!).toBeGreaterThan(20);
      expect(counts[k]!).toBeLessThan(45);
    }
  });

  it("high fame sum = EASY, low = HARD (inverse)", () => {
    const sums = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    const t = computeThresholds(sums);
    expect(classifyDifficulty(900, t)).toBe("EASY");
    expect(classifyDifficulty(100, t)).toBe("HARD");
  });
});
