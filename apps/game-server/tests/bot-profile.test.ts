import { describe, expect, it } from "vitest";
import { generateBotProfile, seededRng } from "../src/bots/profile.js";
import { personalityForSeed } from "../src/bots/strategy.js";

/**
 * Phase 5 — the pure fabricated-profile generator. Deterministic per seed, with
 * internally-consistent, believable values. No DB.
 */

describe("generateBotProfile", () => {
  it("is deterministic for the same personality + seed", () => {
    const p = personalityForSeed(900001);
    const a = generateBotProfile(p, seededRng(900001));
    const b = generateBotProfile(p, seededRng(900001));
    expect(a).toEqual(b);
  });

  it("keeps the invariant wins + losses + folds === matches (all non-negative)", () => {
    for (let pn = 900001; pn <= 900100; pn++) {
      const prof = generateBotProfile(personalityForSeed(pn), seededRng(pn));
      expect(prof.wins + prof.losses + prof.folds).toBe(prof.matches);
      expect(prof.wins).toBeGreaterThanOrEqual(0);
      expect(prof.losses).toBeGreaterThanOrEqual(0);
      expect(prof.folds).toBeGreaterThanOrEqual(0);
    }
  });

  it("produces believable, bounded values and a consistent level", () => {
    for (let pn = 900001; pn <= 900100; pn++) {
      const prof = generateBotProfile(personalityForSeed(pn), seededRng(pn));
      expect(prof.matches).toBeGreaterThanOrEqual(30);
      expect(prof.matches).toBeLessThanOrEqual(820);
      expect(prof.level).toBeGreaterThanOrEqual(1);
      expect(typeof prof.netProfit).toBe("bigint");
      expect(typeof prof.xp).toBe("bigint");
      expect(prof.likesReceived).toBeGreaterThanOrEqual(0);
      expect(prof.likesReceived).toBeLessThanOrEqual(60);
      expect(prof.longestWinStreak).toBeGreaterThanOrEqual(1);
      // A winning record over a long career should not be losing money on net,
      // and the biggest single win/loss are positive magnitudes.
      expect(prof.biggestWin).toBeGreaterThan(0n);
      expect(prof.biggestLoss).toBeGreaterThan(0n);
    }
  });

  it("varies across identities (not 100 copies)", () => {
    const sigs = new Set<string>();
    const levels = new Set<number>();
    for (let pn = 900001; pn <= 900100; pn++) {
      const prof = generateBotProfile(personalityForSeed(pn), seededRng(pn));
      sigs.add(`${prof.matches}:${prof.wins}:${prof.netProfit}`);
      levels.add(prof.level);
    }
    expect(sigs.size).toBeGreaterThan(95); // virtually all unique
    expect(levels.size).toBeGreaterThan(3); // a spread of levels
  });
});
