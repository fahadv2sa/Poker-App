import { describe, it, expect } from "vitest";
import {
  correctProbability,
  pickWeightedRank,
  decideNormalTurn,
  decideHintAnswer,
  skillForDifficulty,
} from "../src/index.js";

/** Deterministic mulberry32 RNG. */
function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("bot model", () => {
  it("correct probability rises with skill, within [0,1]", () => {
    expect(correctProbability(0)).toBeCloseTo(0.4, 5);
    expect(correctProbability(1)).toBeCloseTo(0.9, 5);
    expect(correctProbability(0.5)).toBeCloseTo(0.65, 5);
  });

  it("strong bots skew toward the valuable bottom (rank 10), weak toward famous top", () => {
    const hidden = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const sample = (skill: number) => {
      const rng = rngFrom(123);
      let sum = 0;
      const N = 4000;
      for (let i = 0; i < N; i++) sum += pickWeightedRank(hidden, skill, rng)!;
      return sum / N;
    };
    const weakAvg = sample(0.2);
    const strongAvg = sample(0.9);
    expect(strongAvg).toBeGreaterThan(weakAvg);
    expect(strongAvg).toBeGreaterThan(6); // strong leans to high ranks
    expect(weakAvg).toBeLessThan(5); // weak leans to low ranks
  });

  it("decideNormalTurn is deterministic for a seeded RNG", () => {
    const a = decideNormalTurn([1, 2, 3, 10], 0.8, rngFrom(7));
    const b = decideNormalTurn([1, 2, 3, 10], 0.8, rngFrom(7));
    expect(a).toEqual(b);
  });

  it("decideHintAnswer reaction stays within the open window", () => {
    const d = decideHintAnswer([1, 2, 10], 0.5, rngFrom(99), 30);
    expect(d.reactionMs).toBeGreaterThan(0);
    expect(d.reactionMs).toBeLessThan(30_000);
  });

  it("skill bands respect the difficulty queue", () => {
    const rng = rngFrom(5);
    for (let i = 0; i < 50; i++) {
      const s = skillForDifficulty("EASY", rng);
      expect(s).toBeGreaterThanOrEqual(0.3);
      expect(s).toBeLessThanOrEqual(0.5);
    }
  });
});
