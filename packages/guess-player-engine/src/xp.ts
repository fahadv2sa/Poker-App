import { GP_XP } from "@fb/shared";

/**
 * XP + cosmetic level. XP = the points a player earned (the scoring formula
 * already applies the difficulty multiplier), plus the match-winner bonus.
 * Same curve shape as Top Ten's, with GP-scaled constants (GP_XP). Pure.
 */

export const gpMatchWinBonus = GP_XP.matchWinBonus;

/** Cumulative XP required to be exactly at the START of a level (level 1 = 0).
 *  Cost to go L→L+1 = base + (L-1)*step → cumulative is an arithmetic series. */
export function gpXpThresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return n * GP_XP.levelBaseCost + (GP_XP.levelStep * (n * (n - 1))) / 2;
}

/** The level a given total XP corresponds to (cosmetic). */
export function gpLevelForXp(totalXp: number): number {
  let level = 1;
  while (totalXp >= gpXpThresholdForLevel(level + 1)) level++;
  return level;
}

/** Progress within the current level, for the UI bar. */
export function gpLevelProgress(totalXp: number): {
  level: number;
  intoLevel: number;
  levelSpan: number;
} {
  const level = gpLevelForXp(totalXp);
  const start = gpXpThresholdForLevel(level);
  const next = gpXpThresholdForLevel(level + 1);
  return { level, intoLevel: totalXp - start, levelSpan: next - start };
}
