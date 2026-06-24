import { ruleSchema, type Rule } from "@fb/shared";
import { evaluateRank } from "./evaluate.js";
import type {
  ClaimValidation,
  HandRankDef,
  Pool,
  Resolution,
  ValidClaim,
} from "./types.js";

/**
 * Public engine API (Section 7.5). All pure: no I/O, no DB, no clock. Callers
 * (the game server) pass in the pool and the HandRank definitions read from the
 * database; the engine renders verdicts.
 */

/**
 * Parse the untyped `rule` jsonb from a HandRanks row into a validated Rule.
 * Throws if the DSL is malformed — a seed/data error, surfaced loudly.
 */
export function parseRule(raw: unknown): Rule {
  return ruleSchema.parse(raw);
}

/**
 * Every rank the pool satisfies, strongest first. Ties in strength keep their
 * input order (the catalog assigns unique strengths, so this is deterministic).
 */
export function achievableRanks(pool: Pool, ranks: readonly HandRankDef[]): HandRankDef[] {
  return ranks
    .filter((r) => evaluateRank(r.rule, pool))
    .sort((a, b) => b.strength - a.strength);
}

/** The single strongest rank the pool satisfies, or null if it satisfies none. */
export function bestAchievableRank(
  pool: Pool,
  ranks: readonly HandRankDef[],
): HandRankDef | null {
  let best: HandRankDef | null = null;
  for (const r of ranks) {
    if (evaluateRank(r.rule, pool) && (best === null || r.strength > best.strength)) {
      best = r;
    }
  }
  return best;
}

/**
 * Validate a player's claim (Section 11). `isValid` is true only if the pool
 * actually achieves the claimed rank — a wrong claim loses even when the pool
 * holds something stronger. `bestPossibleRankId` reports what they *could* have
 * claimed, for UX/analytics; it never influences `isValid`.
 *
 * Throws on an unknown `claimedRankId` (the rank list is server-controlled, so
 * an unknown id is a bug, not user input).
 */
export function validateClaim(
  pool: Pool,
  claimedRankId: string,
  ranks: readonly HandRankDef[],
): ClaimValidation {
  const claimed = ranks.find((r) => r.id === claimedRankId);
  if (!claimed) {
    throw new Error(`Unknown hand rank id: ${claimedRankId}`);
  }
  const best = bestAchievableRank(pool, ranks);
  return {
    isValid: evaluateRank(claimed.rule, pool),
    bestPossibleRankId: best?.id ?? null,
  };
}

/**
 * Decide winners among valid claims by claimed strength (Section 11). The
 * highest strength wins; ties split. Wrong claims and non-choosers must already
 * be excluded by the caller — only validated claims belong here.
 */
export function resolveByStrength(validClaims: readonly ValidClaim[]): Resolution {
  let topStrength = -Infinity;
  for (const c of validClaims) if (c.strength > topStrength) topStrength = c.strength;

  const winners = validClaims
    .filter((c) => c.strength === topStrength)
    .map((c) => c.ref);

  return { winners, isSplit: winners.length > 1 };
}
