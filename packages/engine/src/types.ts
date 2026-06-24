import type { Rule, RuleAttribute } from "@fb/shared";

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

/**
 * One leaf-rule match inside a witness: which pool cards satisfied a single
 * group/coverage leaf, and on what shared attribute and value. This is the raw
 * *evidence* behind a rank — the engine surfaces the structure (it never
 * localizes); the caller maps `value` (an opaque token) to a display name.
 *
 *  - nationality/position: `value` is the shared token (a nationality name or a
 *    position code such as "GK").
 *  - club, match "shared": `value` is the single shared club token.
 *  - club, match "identical": `value` is the canonical full club-set key; read
 *    the cards' own `clubs` for the actual set.
 */
export interface WitnessGroup {
  attribute: RuleAttribute;
  /** club only: how the match was made. Absent for nationality/position. */
  match?: "shared" | "identical";
  value: string;
  /** Indices into the pool of the cards forming this group. */
  cardIndices: number[];
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
