/**
 * Ranking + the two tie-breaks (brief §6.4):
 *   1. order by the statistic value (desc)
 *   2. tie on value → higher fame_score ranks higher
 *   3. tie on fame too → alphabetical by ARABIC letters (asc)
 * Pure + deterministic.
 */
import { TT_LIST_SIZE } from "@fb/shared";
import type { CandidateRow, RankedPlayer } from "./types.js";

/** Arabic-collation comparison for tie-break 3. Uses ICU via Intl (available in
 *  Node ≥ 13 full-ICU, which this runtime ships). Falls back to code-point order
 *  if a name is missing. */
const arabicCollator = new Intl.Collator("ar", { sensitivity: "variant", numeric: false });

export function compareArabic(a: string, b: string): number {
  return arabicCollator.compare(a, b);
}

/**
 * Total ordering used for ranking. Returns <0 if `a` should rank ABOVE `b`.
 * value desc → fame desc → Arabic name asc → playerId asc (final deterministic
 * tiebreaker so the order is never ambiguous).
 */
export function compareForRank(a: CandidateRow, b: CandidateRow): number {
  const av = a.value ?? -Infinity;
  const bv = b.value ?? -Infinity;
  if (av !== bv) return bv - av; // higher value first
  if (a.fame !== b.fame) return b.fame - a.fame; // higher fame first
  const byName = compareArabic(a.nameAr || a.name, b.nameAr || b.name);
  if (byName !== 0) return byName;
  return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
}

/**
 * Build the ranked Top-10 from candidate rows. Only players with a positive value
 * are eligible (a 0/null stat can't be a "top scorer"). Returns up to TT_LIST_SIZE
 * ranked rows; the caller's gate guarantees ≥10 before this is used for a real list.
 */
export function buildRanking(rows: readonly CandidateRow[]): RankedPlayer[] {
  return buildRankingWithExcluded(rows).list;
}

/**
 * Like {@link buildRanking}, but ALSO returns `eleventhValue` — the stat value of
 * the best EXCLUDED candidate (the 11th place). The catalog validator needs this to
 * reject a "boundary tie": if the 10th and 11th values are equal, the Top-10 cutoff
 * is ambiguous (a contestant who picks the legitimately-tied excluded player would
 * be told "wrong" — a game-killing error). `eleventhValue` is null when there are
 * 10 or fewer eligible candidates.
 */
export function buildRankingWithExcluded(rows: readonly CandidateRow[]): {
  list: RankedPlayer[];
  eleventhValue: number | null;
} {
  const eligible = rows.filter((r) => (r.value ?? 0) > 0);
  const sorted = [...eligible].sort(compareForRank);
  const list = sorted.slice(0, TT_LIST_SIZE).map((r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    value: r.value ?? 0,
    fame: r.fame,
    name: r.name,
    nameAr: r.nameAr,
  }));
  const eleventhValue = sorted.length > TT_LIST_SIZE ? sorted[TT_LIST_SIZE]!.value ?? null : null;
  return { list, eleventhValue };
}
