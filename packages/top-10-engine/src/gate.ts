/**
 * Completeness gate (brief §6.1, approved §1 of the build plan). A (type,
 * competition, season) is admitted only if the data is complete enough to form a
 * TRUE correct Top-10. Field-fill among the "regulars" is the measurable proxy;
 * roster completeness is unmeasurable from inside, so the owner also reviews the
 * generated catalog (D5/D6). Pure — operates on already-aggregated candidate rows.
 */
import { TT_GATE, TT_LIST_SIZE } from "@fb/shared";
import { buildRanking } from "./ranking.js";
import type { CandidateRow } from "./types.js";

export interface GateConfig {
  minAppearances: number;
  regularsTopN: number;
  regularsFillMin: number;
  minQualifiers: number;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  minAppearances: TT_GATE.minAppearances,
  regularsTopN: TT_GATE.regularsTopN,
  regularsFillMin: TT_GATE.regularsFillMin,
  minQualifiers: TT_GATE.minQualifiers,
};

export interface GateResult {
  admit: boolean;
  reasons: string[]; // why it was rejected (empty if admitted)
  metrics: {
    regulars: number;
    regularsFilled: number;
    regularsFillPct: number;
    qualifiers: number;
    tenthValue: number;
  };
}

/**
 * Evaluate the gate. Steps:
 *  - "regulars" = players with appearances ≥ minAppearances, top-N by appearances.
 *  - regularsFill = fraction of regulars whose stat value is present (non-null).
 *  - qualifiers = players with value > 0.
 *  - tenthValue = the 10th-highest value (from the ranking) — must be > 0.
 *  Admit iff regularsFill ≥ regularsFillMin AND qualifiers ≥ minQualifiers AND
 *  tenthValue > 0.
 */
export function evaluateGate(
  rows: readonly CandidateRow[],
  cfg: GateConfig = DEFAULT_GATE_CONFIG,
): GateResult {
  const regularsAll = rows
    .filter((r) => r.appearances >= cfg.minAppearances)
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, cfg.regularsTopN);
  const regulars = regularsAll.length;
  const regularsFilled = regularsAll.filter((r) => r.value != null).length;
  const regularsFillPct = regulars > 0 ? regularsFilled / regulars : 0;

  const qualifiers = rows.filter((r) => (r.value ?? 0) > 0).length;
  const ranked = buildRanking(rows);
  const tenthValue = ranked.length >= TT_LIST_SIZE ? ranked[TT_LIST_SIZE - 1]!.value : 0;

  const reasons: string[] = [];
  if (regulars === 0) reasons.push("no regulars (≥minAppearances) in this comp/season");
  if (regularsFillPct < cfg.regularsFillMin)
    reasons.push(
      `regulars fill ${(regularsFillPct * 100).toFixed(0)}% < ${(cfg.regularsFillMin * 100).toFixed(0)}%`,
    );
  if (qualifiers < cfg.minQualifiers)
    reasons.push(`only ${qualifiers} qualifiers < ${cfg.minQualifiers}`);
  if (tenthValue <= 0) reasons.push("fewer than 10 players with a positive value");

  return {
    admit: reasons.length === 0,
    reasons,
    metrics: { regulars, regularsFilled, regularsFillPct, qualifiers, tenthValue },
  };
}
