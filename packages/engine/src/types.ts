import type { Rule } from "@fp/shared";

/**
 * The engine's projection of a football player onto the three attributes the
 * association rules care about (Section 7.1). The engine treats every value as
 * an opaque token — it never hardcodes any nationality, position, or club.
 *
 *  - `nationality`: exactly one value.
 *  - `position`: exactly one value (a position code; only `coverage` cares that
 *     the four canonical codes GK/DEF/MID/FWD are present).
 *  - `clubs`: a set of values (a player may have passed through several clubs).
 */
export interface Card {
  nationality: string;
  position: string;
  clubs: readonly string[];
}

/**
 * A pool is the 7 cards a player evaluates over (2 hole + 5 community). The
 * engine is agnostic to pool size; thresholds in the rules do the gating.
 */
export type Pool = readonly Card[];

/**
 * A hand-rank definition as the engine consumes it — a DB row reduced to the
 * fields that matter for evaluation. `id` is the HandRanks PK used by claims.
 */
export interface HandRankDef {
  id: string;
  code: string;
  strength: number;
  rule: Rule;
}

/** Result of validating a player's claimed rank against their pool. */
export interface ClaimValidation {
  /** True iff the pool actually satisfies the claimed rank. */
  isValid: boolean;
  /** Highest-strength rank the pool could legitimately claim, or null. */
  bestPossibleRankId: string | null;
}

/** One entrant into showdown resolution: a player and the rank they validly claimed. */
export interface ValidClaim {
  /** Opaque caller reference (seat number, game-player id, …). */
  ref: string;
  /** Strength of the rank this player validly claimed. */
  strength: number;
}

/** Outcome of comparing valid claims by strength. */
export interface Resolution {
  /** Refs of the winner(s) — those tied at the highest strength. */
  winners: string[];
  /** True iff more than one winner (pot is split). */
  isSplit: boolean;
}
