/**
 * Football Hand Engine — Phase 2.
 *
 * Pure, I/O-free functions that interpret the Rule DSL (Section 7.3/7.4) read
 * from the HandRanks table and evaluate the 9 football associations over a
 * 7-card pool. No football data — nationalities, clubs, positions — is ever
 * hardcoded; the engine treats attribute values as opaque tokens and the rules
 * come entirely from data.
 */

export type {
  Card,
  Pool,
  HandRankDef,
  ClaimValidation,
  ValidClaim,
  Resolution,
  WitnessGroup,
} from "./types.js";

export {
  enumerateWitnesses,
  evaluateRank,
  enumerateExplained,
  explainRank,
} from "./evaluate.js";

export {
  parseRule,
  achievableRanks,
  bestAchievableRank,
  validateClaim,
  resolveByStrength,
} from "./engine.js";

// --- Phase 3: pure betting / pots / fold / resolve ---
export { computeFold } from "./fold.js";
export type { FoldAccounting, FoldParams } from "./fold.js";

export { buildSidePots, totalPot } from "./pots.js";
export type { PotSeat, SidePot } from "./pots.js";

export { resolveShowdown, netBySeat } from "./resolve.js";
export type { Settlement, ResolveSeat, ResolveResult } from "./resolve.js";

export {
  openRound,
  clearRoundCommitments,
  firstToAct,
  nextToAct,
  legalActions,
  applyAction,
  isRoundComplete,
  isHandOver,
} from "./betting.js";
export type {
  BettingSeat,
  BettingState,
  SeatStatus,
  Action,
  ActionType,
  ChipMovement,
  ApplyResult,
  LegalActions,
} from "./betting.js";

// Re-export the Rule DSL types and canonical catalog from shared so engine
// consumers have a single import surface.
export {
  HAND_RANK_CATALOG,
  ruleSchema,
  type Rule,
  type RuleAttribute,
  type GroupRule,
  type CoverageRule,
  type AnyOfRule,
  type AllOfRule,
  type HandRankDefinition,
} from "@fb/shared";
