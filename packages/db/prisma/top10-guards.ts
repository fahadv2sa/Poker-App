/**
 * Build-time integrity guards shared by the Top Ten catalog BUILDER and AUDIT, so
 * both enforce identical rules (no drift between "what we ship" and "what we check").
 *
 *  - value sanity: a value above the type's reviewed ceiling means a wrong source
 *    column or a unit mismatch — it can never be a real season total.
 *  - findability: an answer must be SELECTABLE in the player search, otherwise the
 *    card is unanswerable. This replicates apps/top-10-web/src/app/api/search exactly
 *    (prefix/word-prefix on name OR name_ar among ACTIVE players, fame DESC, LIMIT).
 */
import { TT_TYPE_META, type TtQuestionType } from "@fb/shared";

/**
 * The SQL value-expression each active type ranks on (table aliased `s`). SINGLE
 * source of truth — both the builder and the audit import this, so the catalog and
 * its check can never use a different metric. SUM aggregates a player's multi-row
 * transfer lines within ONE competition-season. ACCURATE_PASSES clamps accuracy to
 * [0,100] (a few source rows have an impossible >100%), guaranteeing accurate ≤ total.
 */
export const VALUE_EXPR: Record<TtQuestionType, string> = {
  GOAL_SCORERS: "SUM(s.goals_total)",
  ASSISTS: "SUM(s.goals_assists)",
  KEY_PASSES: "SUM(s.passes_key)",
  TACKLES: "SUM(s.tackles_total)",
  // CASE preserves NULL (unknown accuracy stays unknown — Postgres LEAST/GREATEST
  // would otherwise treat NULL as 0 and corrupt the completeness gate's fill%). Only
  // a PRESENT accuracy is clamped to [0,100], guaranteeing accurate ≤ total passes.
  ACCURATE_PASSES:
    "SUM(CASE WHEN s.passes_accuracy IS NULL THEN NULL ELSE s.passes_total * LEAST(GREATEST(s.passes_accuracy, 0), 100) / 100.0 END)",
  GK_CLEAN_SHEETS: "NULL", // dormant
};

/** The search LIMIT in apps/top-10-web/src/app/api/search/route.ts — keep in sync. */
export const SEARCH_LIMIT = 12;

export interface SearchPlayer {
  id: string;
  name: string;
  nameAr: string | null;
  fame: number;
  active: boolean;
}

/** Replicate the search ranking in memory: id list (fame DESC) of the top matches. */
export function searchTopIds(index: readonly SearchPlayer[], q: string, limit = SEARCH_LIMIT): string[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const hit = (s: string) => s.startsWith(term) || s.includes(" " + term);
  return index
    .filter((p) => p.active && (hit(p.name.toLowerCase()) || hit((p.nameAr ?? "").toLowerCase())))
    .sort((a, b) => b.fame - a.fame)
    .slice(0, limit)
    .map((p) => p.id);
}

/**
 * Selectable by typing the player's full ARABIC name (id within the top-N results).
 * This is an Arabic-first game, so an answer that can't be found by its Arabic name is
 * effectively unanswerable — even if its English name would match. A missing/blank
 * name_ar is unfindable (and is also rejected by the list validator).
 */
export function isFindable(
  index: readonly SearchPlayer[],
  p: { id: string; nameAr: string | null },
): boolean {
  const ar = (p.nameAr ?? "").trim();
  return ar.length > 0 && searchTopIds(index, ar).includes(p.id);
}

/** Values above the type's reviewed ceiling (wrong column / unit). Empty = OK. */
export function valueSanityViolations(
  type: TtQuestionType,
  players: ReadonlyArray<{ rank: number; value: number }>,
): string[] {
  const max = TT_TYPE_META[type].sanityMax;
  const out: string[] = [];
  for (const p of players) {
    if (!(p.value > 0) || p.value > max) {
      out.push(`rank ${p.rank}: value ${p.value} outside (0, ${max}] for ${type} (wrong column / unit?)`);
    }
  }
  return out;
}
