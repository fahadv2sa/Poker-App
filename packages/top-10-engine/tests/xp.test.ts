import { describe, it, expect } from "vitest";
import { roundXp, tailBonus, levelForXp, xpThresholdForLevel, matchWinBonus } from "../src/index.js";

describe("XP", () => {
  it("round XP = points × multiplier + tail bonus", () => {
    // revealed ranks 10 and 3 → points 13; HARD ×2 = 26; tail bonus +15 (for #10)
    expect(roundXp(13, "HARD", [10, 3])).toBe(26 + 15);
    // EASY ×1, no tail ranks
    expect(roundXp(6, "EASY", [1, 2, 3])).toBe(6);
    // MEDIUM ×1.5 of 10 = 15; tail #9 +10
    expect(roundXp(10, "MEDIUM", [9, 1])).toBe(15 + 10);
  });

  it("tail bonus only rewards #8/#9/#10, cumulatively", () => {
    expect(tailBonus([8, 9, 10])).toBe(5 + 10 + 15);
    expect(tailBonus([1, 2, 7])).toBe(0);
  });

  it("match win bonus is the approved 50", () => {
    expect(matchWinBonus).toBe(50);
  });

  it("level curve is monotonic and increasing in cost", () => {
    expect(xpThresholdForLevel(1)).toBe(0);
    expect(xpThresholdForLevel(2)).toBe(100); // base
    expect(xpThresholdForLevel(3)).toBe(100 + 150); // +base+step
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(249)).toBe(2);
    expect(levelForXp(250)).toBe(3);
  });
});
