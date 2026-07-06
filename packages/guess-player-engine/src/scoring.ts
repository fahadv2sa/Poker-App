import type { GpDifficulty } from "./types.js";

/**
 * Scoring — points only, no coins (locked rules). All values approved in the
 * Phase 0 review (2026-07-05).
 */

/** Round timer: 10 minutes. */
export const GP_ROUND_SECONDS = 600;
/** Turn timer: 30 seconds (one question OR one guess per turn; raised from
 *  20s by owner ruling 2026-07-06 — keep in lockstep with GP_TIMING.turnSec). */
export const GP_TURN_SECONDS = 30;
/** Guess attempts per contestant per round. */
export const GP_GUESS_ATTEMPTS = 3;
/** Room size bounds: created rooms 2–6; quick play matches 2–4 and solo
 *  VS_SYSTEM is allowed (no bots in v1). Rounds are OPEN-ENDED — the session
 *  continues via the winner-screen countdown until players leave. */
export const GP_ROOM_MIN_PLAYERS = 2;
export const GP_ROOM_MAX_PLAYERS = 6;
export const GP_QUICK_PLAY_MAX_PLAYERS = 4;

/** VS_HUMANS: fixed picker bonus when the round times out unsolved. */
export const GP_SURVIVAL_BONUS = 150;
/** VS_HUMANS: picker's share of the winner's points on a solved round
 *  (accepted incentive fix — good picks pay too). */
export const GP_PICKER_SHARE = 0.25;

/** VS_SYSTEM difficulty multipliers (VS_HUMANS has no tiers → ×1). */
export const GP_DIFFICULTY_MULTIPLIER: Record<GpDifficulty, number> = {
  EASY: 1.0,
  MEDIUM: 1.25,
  HARD: 1.5,
};

/**
 * VS_SYSTEM hidden-player pool: player_score floors per tier, from the
 * measured distribution (8,228 players): EASY ≥70 → 190 players,
 * MEDIUM 50–69 → 1,453, HARD 35–49 → 2,295. Scores <35 are excluded from
 * VS_SYSTEM entirely (unguessable) but stay pickable in VS_HUMANS.
 * Compare on floor(score) so decimals never shift a boundary (the same
 * convention as Link Up's difficulty pools).
 */
export const GP_TIER_SCORE_RANGE: Record<GpDifficulty, { min: number; max: number | null }> = {
  EASY: { min: 70, max: null },
  MEDIUM: { min: 50, max: 69 },
  HARD: { min: 35, max: 49 },
};
export const GP_VS_SYSTEM_MIN_SCORE = 35;

/**
 * Points for the correct guess: pure time-scaling per the locked rules —
 * round(500 × remaining/600), floor 100, then the difficulty multiplier
 * (VS_SYSTEM only; pass null for VS_HUMANS).
 */
export function winnerPoints(remainingSec: number, difficulty: GpDifficulty | null): number {
  const rem = Math.max(0, Math.min(GP_ROUND_SECONDS, remainingSec));
  const base = Math.max(100, Math.round((500 * rem) / GP_ROUND_SECONDS));
  const mult = difficulty ? GP_DIFFICULTY_MULTIPLIER[difficulty] : 1;
  return Math.round(base * mult);
}

/** VS_HUMANS picker's cut of a solved round. */
export function pickerPoints(winner: number): number {
  return Math.round(winner * GP_PICKER_SHARE);
}
