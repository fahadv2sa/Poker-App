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
 * Build the ANSWER LIST with INCLUSIVE cutoff ties — the list that ships in the
 * catalog. Ranks 1..9 are the distinct top nine; **rank 10 is shared by EVERY player
 * tied at the 10th-place value**. So a tie at the cutoff is NOT an error and does NOT
 * drop the question: every tied player is a valid rank-10 answer (the game-server
 * maps them all to rank 10, so naming any of them is accepted, never marked wrong).
 *
 * Also returns `excludedTopValue` — the stat value of the best player left OUT (null
 * if none were excluded). The validator asserts it is STRICTLY below the cutoff
 * value, which proves the tie group is complete (no tied correct answer was wrongly
 * excluded). The returned list may therefore contain MORE than TT_LIST_SIZE players.
 */
export function buildAnswerList(rows: readonly CandidateRow[]): {
  list: RankedPlayer[];
  excludedTopValue: number | null;
} {
  const eligible = rows.filter((r) => (r.value ?? 0) > 0);
  const sorted = [...eligible].sort(compareForRank);
  const toRanked = (r: CandidateRow, rank: number): RankedPlayer => ({
    rank,
    playerId: r.playerId,
    value: r.value ?? 0,
    fame: r.fame,
    name: r.name,
    nameAr: r.nameAr,
  });

  // Short list (≤10 eligible): everyone is included with a distinct rank.
  if (sorted.length <= TT_LIST_SIZE) {
    return { list: sorted.map((r, i) => toRanked(r, i + 1)), excludedTopValue: null };
  }

  const cutoffValue = sorted[TT_LIST_SIZE - 1]!.value ?? 0; // the 10th-place value
  const list: RankedPlayer[] = [];
  let excludedTopValue: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (i < TT_LIST_SIZE - 1) {
      list.push(toRanked(r, i + 1)); // ranks 1..9
    } else if ((r.value ?? 0) === cutoffValue) {
      list.push(toRanked(r, TT_LIST_SIZE)); // rank 10 — every player tied at the cutoff
    } else {
      excludedTopValue = r.value ?? 0; // highest value among the excluded
      break;
    }
  }
  return { list, excludedTopValue };
}
