/**
 * XP + cosmetic level (brief §9, approved numbers in the build plan).
 *   round XP  = round_points × difficulty_multiplier + tail_bonus
 *   match end = winner gets +matchWinBonus (no separate runner-up bonus — approved)
 * Pure.
 */
import { TT_XP, type TtDifficulty } from "@fb/shared";

/** Tail bonus for the set of ranks a player personally revealed this round (#8/#9/#10). */
export function tailBonus(revealedRanks: readonly number[]): number {
  let bonus = 0;
  for (const r of revealedRanks) bonus += TT_XP.tailBonus[r] ?? 0;
  return bonus;
}

/** XP a player earns for one round. `roundPoints` = Σ of the ranks they revealed. */
export function roundXp(
  roundPoints: number,
  difficulty: TtDifficulty,
  revealedRanks: readonly number[],
): number {
  const mult = TT_XP.difficultyMultiplier[difficulty];
  return Math.round(roundPoints * mult) + tailBonus(revealedRanks);
}

export const matchWinBonus = TT_XP.matchWinBonus;

/** Cumulative XP required to be exactly at the START of a level (level 1 = 0).
 *  Cost to go L→L+1 = base + (L-1)*step → cumulative is an arithmetic series. */
export function xpThresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  // Σ_{L=1}^{level-1} (base + (L-1)*step)
  const n = level - 1;
  return n * TT_XP.levelBaseCost + (TT_XP.levelStep * (n * (n - 1))) / 2;
}

/** The level a given total XP corresponds to (cosmetic). */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (totalXp >= xpThresholdForLevel(level + 1)) level++;
  return level;
}

/** Progress within the current level, for the UI bar. */
export function levelProgress(totalXp: number): {
  level: number;
  intoLevel: number;
  levelSpan: number;
} {
  const level = levelForXp(totalXp);
  const start = xpThresholdForLevel(level);
  const next = xpThresholdForLevel(level + 1);
  return { level, intoLevel: totalXp - start, levelSpan: next - start };
}
