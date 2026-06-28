/**
 * Difficulty tiering (brief §7, approved). Difficulty derives from the SUM of the
 * 10 players' fame_score, INVERSELY: high Σ = famous players = EASY; low Σ = HARD.
 * Method: take the Σ-fame distribution across ALL admitted lists and split into
 * terciles — top third → EASY, middle → MEDIUM, bottom third → HARD. Pure.
 */
import type { TtDifficulty } from "@fb/shared";

export interface DifficultyThresholds {
  /** Σ fame ≥ easyMinSum → EASY. */
  easyMinSum: number;
  /** Σ fame < hardMaxSum → HARD. */
  hardMaxSum: number;
}

/** Linear-interpolated percentile of a numeric sample (p in [0,1]). */
export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const frac = idx - lo;
  return sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac;
}

/**
 * Compute the two tercile thresholds from every admitted list's Σ fame.
 * hardMaxSum = 33rd percentile (bottom third = hardest);
 * easyMinSum = 67th percentile (top third = easiest).
 */
export function computeThresholds(fameSums: readonly number[]): DifficultyThresholds {
  const sorted = [...fameSums].sort((a, b) => a - b);
  return {
    hardMaxSum: percentile(sorted, 1 / 3),
    easyMinSum: percentile(sorted, 2 / 3),
  };
}

/** Map a single list's Σ fame to a tier. Boundaries: ≥easyMinSum EASY, <hardMaxSum
 *  HARD, otherwise MEDIUM. (If thresholds coincide on a degenerate distribution,
 *  EASY wins the tie, then HARD, then MEDIUM — deterministic.) */
export function classifyDifficulty(fameSum: number, t: DifficultyThresholds): TtDifficulty {
  if (fameSum >= t.easyMinSum) return "EASY";
  if (fameSum < t.hardMaxSum) return "HARD";
  return "MEDIUM";
}
