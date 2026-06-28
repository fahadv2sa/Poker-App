/**
 * Bot decision model (brief §8.2, approved params in @fb/shared TT_BOTS). Pure +
 * deterministic given an injected RNG, so it is fully unit-testable. The server's
 * bot controller resolves the abstract decisions into concrete player ids and
 * schedules them with human-like delays; the engine only decides intent.
 *
 * Skill s ∈ [0,1]:
 *  - per-turn correct probability  p = base + slope·s
 *  - WHICH hidden card: weight(rank) ∝ rank^k, k = (2s−1)·2  → weak bots favour
 *    famous rank-1 (low points), strong bots hunt rank-10 (high points)
 *  - fastest-answer reaction time falls as skill rises
 */
import { TT_BOTS, type TtDifficulty } from "@fb/shared";

export type Rng = () => number; // [0,1)

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Per-turn probability the bot guesses correctly. */
export function correctProbability(skill: number): number {
  return clamp01(TT_BOTS.correctProbBase + TT_BOTS.correctProbSlope * clamp01(skill));
}

/** Pick a hidden rank, weighted by rank^k (k from skill). Returns null if none. */
export function pickWeightedRank(hiddenRanks: readonly number[], skill: number, rng: Rng): number | null {
  if (hiddenRanks.length === 0) return null;
  const k = (2 * clamp01(skill) - 1) * 2;
  const weights = hiddenRanks.map((r) => Math.pow(r, k));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return hiddenRanks[0]!;
  let x = rng() * total;
  for (let i = 0; i < hiddenRanks.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return hiddenRanks[i]!;
  }
  return hiddenRanks[hiddenRanks.length - 1]!;
}

export type NormalTurnDecision =
  | { kind: "guessCorrect"; rank: number } // reveal this still-hidden rank
  | { kind: "guessWrong" }; // burn the turn with a wrong (out-of-top-10) pick

/** Normal turn-based mode: succeed with `p`, else make a wrong guess (ending the
 *  turn promptly — realistic and keeps the game flowing). */
export function decideNormalTurn(
  hiddenRanks: readonly number[],
  skill: number,
  rng: Rng,
): NormalTurnDecision {
  if (hiddenRanks.length > 0 && rng() < correctProbability(skill)) {
    const rank = pickWeightedRank(hiddenRanks, skill, rng);
    if (rank != null) return { kind: "guessCorrect", rank };
  }
  return { kind: "guessWrong" };
}

export interface HintAnswerDecision {
  /** Whether the bot attempts an answer at all this window. */
  willAttempt: boolean;
  /** Delay before it acts, in ms (always < the open window). */
  reactionMs: number;
  /** True = a correct hidden card; false = a wrong attempt (consumes one of 3). */
  correct: boolean;
  /** The hidden rank it will reveal when `correct` (null otherwise). */
  rank: number | null;
}

/**
 * Fastest-answer (hint) mode: the bot may grab ANY hidden card (not only the hint
 * target). Reaction time = min + range·(1−skill) + jitter, capped under the open
 * window. With probability `p` it answers correctly (weighted hidden card), else it
 * spends a wrong attempt.
 */
export function decideHintAnswer(
  hiddenRanks: readonly number[],
  skill: number,
  rng: Rng,
  openWindowSec: number,
): HintAnswerDecision {
  const s = clamp01(skill);
  const jitter = (rng() * 2 - 1) * TT_BOTS.reactJitterSec;
  const reactionSec = Math.max(
    0.5,
    Math.min(openWindowSec - 0.5, TT_BOTS.reactMinSec + TT_BOTS.reactRangeSec * (1 - s) + jitter),
  );
  const correct = hiddenRanks.length > 0 && rng() < correctProbability(s);
  return {
    willAttempt: true,
    reactionMs: Math.round(reactionSec * 1000),
    correct,
    rank: correct ? pickWeightedRank(hiddenRanks, s, rng) : null,
  };
}

/** Normal-turn think delay in ms (shorter for higher skill), within the configured band. */
export function turnDelayMs(skill: number, rng: Rng): number {
  const s = clamp01(skill);
  const min = TT_BOTS.turnDelayMinSec;
  const max = TT_BOTS.turnDelayMaxSec;
  // higher skill → nearer the fast end, plus a little randomness
  const base = max - (max - min) * s;
  const sec = Math.max(min, Math.min(max, base + (rng() - 0.5) * 2));
  return Math.round(sec * 1000);
}

/** Draw a skill value in the band for a quick-play difficulty queue. */
export function skillForDifficulty(difficulty: TtDifficulty, rng: Rng): number {
  const [lo, hi] = TT_BOTS.skillByDifficulty[difficulty];
  return lo + (hi - lo) * rng();
}
