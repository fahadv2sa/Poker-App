import { HAND_RANK_CATALOG, type HandRankCode } from "@fb/shared";
import type { Card, HandRankDef } from "../src/index.js";

/**
 * Test helpers. Attribute values are opaque tokens (short codes), underlining
 * that the engine hardcodes no real football data. `nat`/`pos`/`clubs` are
 * arbitrary strings chosen for readability, not a fixed enumeration.
 */

export function card(
  nationality: string,
  position: string,
  clubs: string[] = [],
): Card {
  return { nationality, position, clubs };
}

/**
 * The 9 ranks as the engine consumes them, built from the canonical catalog
 * (the same definitions seeded into HandRanks). Using the catalog directly is
 * the data-driven guarantee: tests exercise the shipped rules, not a copy.
 * The DB PK is mocked with the rank `code`.
 */
export const RANKS: HandRankDef[] = HAND_RANK_CATALOG.map((r) => ({
  id: r.code,
  code: r.code,
  strength: r.strength,
  rule: r.rule,
}));

const byCode = new Map(RANKS.map((r) => [r.code, r]));

export function rank(code: HandRankCode): HandRankDef {
  const r = byCode.get(code);
  if (!r) throw new Error(`missing rank ${code}`);
  return r;
}

/** The Rule DSL for a rank code — convenience for evaluateRank tests. */
export function ruleOf(code: HandRankCode) {
  return rank(code).rule;
}
