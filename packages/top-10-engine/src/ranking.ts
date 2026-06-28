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
 * NOTE: this is the simple, exactly-N slice used by the completeness gate. The
 * catalog itself is built from {@link buildAnswerList}, which keeps cutoff ties.
 */
export function buildRanking(rows: readonly CandidateRow[]): RankedPlayer[] {
  const eligible = rows.filter((r) => (r.value ?? 0) > 0);
  return [...eligible].sort(compareForRank).slice(0, TT_LIST_SIZE).map((r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    value: r.value ?? 0,
    fame: r.fame,
    name: r.name,
    nameAr: r.nameAr,
  }));
}

/**
 * Build the ANSWER LIST as the TOP-10 DISTINCT VALUES, DENSE-ranked (1..10), with
 * EVERY player tied at a value stored at that rank. Ties may appear at ANY rank, and
 * the list may hold well more than 10 players — no tied player is ever dropped, since
 * any of them is a valid answer (the runtime cascade/bonus logic resolves how they
 * score). A value's rank = its position among the distinct values (1 = highest).
 *
 * Also returns `excludedTopValue` — the highest value among the EXCLUDED players (the
 * 11th distinct value), or null if there are ≤10 distinct values. The validator uses
 * it to assert the bottom rank is complete (every player at the 10th value is in).
 */
export function buildAnswerList(rows: readonly CandidateRow[]): {
  list: RankedPlayer[];
  excludedTopValue: number | null;
} {
  const eligible = rows.filter((r) => (r.value ?? 0) > 0);
  const sorted = [...eligible].sort(compareForRank);

  const list: RankedPlayer[] = [];
  let rank = 0;
  let prevValue: number | null = null;
  let excludedTopValue: number | null = null;
  for (const r of sorted) {
    const v = r.value ?? 0;
    if (prevValue === null || v !== prevValue) {
      rank += 1; // new distinct value → next dense rank
      prevValue = v;
    }
    if (rank > TT_LIST_SIZE) {
      excludedTopValue = v; // first excluded distinct value (the highest excluded)
      break;
    }
    list.push({ rank, playerId: r.playerId, value: v, fame: r.fame, name: r.name, nameAr: r.nameAr });
  }
  return { list, excludedTopValue };
}
