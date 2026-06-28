/**
 * Catalog-list INTEGRITY VALIDATOR (pure). The single source of truth for "is this
 * Top-10 list safe to put in front of a contestant?". A failing list is a direct
 * threat to the game — a contestant who gives a correct answer must NEVER be told
 * "wrong", and every revealed card must show correct, findable information. The
 * catalog builder runs this on every list and REFUSES to ship any that fails; the
 * audit tool runs the same check against the live catalog. Pure: the caller supplies
 * the already-fetched football metadata (this package never touches the DB).
 *
 * CUTOFF TIES ARE VALID, NOT AN ERROR. Ranks 1..9 are distinct; rank 10 (the cutoff)
 * may be SHARED by several players tied on the stat value — each is a valid rank-10
 * answer. The validator's job is to ensure that whenever there is a cutoff tie, the
 * tie group is COMPLETE: no tied player is left out of the list (which is the only
 * way a tie could mark a correct answer wrong).
 *
 * Rules enforced (any violation ⇒ the list must not ship):
 *   1. At least TT_LIST_SIZE players; ranks are exactly {1..maxRank} with no gaps;
 *      only the cutoff rank (maxRank, ≤ TT_LIST_SIZE) may be shared by >1 player.
 *   2. Every value is finite and > 0; players sharing a rank share a value; values
 *      are non-increasing across ranks.
 *   3. CUTOFF COMPLETENESS: the best EXCLUDED value is strictly below the cutoff
 *      (rank-maxRank) value — so every player tied at the cutoff is included.
 *   4. No duplicate player id in the list.
 *   5. Every listed player exists in football.players, is `active` (so the search
 *      input can find them), and has a non-empty Arabic name.
 *   6. No two cards share the same Arabic display name.
 *
 * NOTE on internal ties: two players tied on value but at different ranks (1..9) is
 * NOT a violation — both are in the list, so revealing either is a correct answer;
 * only the order among equals (and thus the points) is decided by the deterministic
 * tiebreak. A tie AT THE CUTOFF is handled by rule 3 (include them all as rank 10).
 */
import { TT_LIST_SIZE } from "@fb/shared";
import type { RankedPlayer } from "./types.js";

/** Football metadata the validator needs for each listed player (DB-fetched by the
 *  caller; absent from the map ⇒ the player row does not exist). */
export interface ListPlayerMeta {
  active: boolean;
  nameAr: string | null;
}

export interface ValidateListInput {
  /** The built answer list (ranks 1..9 distinct; rank 10 may be a tie group). */
  list: readonly RankedPlayer[];
  /** Value of the best EXCLUDED candidate; null if none were excluded. */
  excludedTopValue: number | null;
  /** playerId → football metadata (name_ar, active). */
  meta: ReadonlyMap<string, ListPlayerMeta>;
}

/**
 * Returns the list of integrity violations (human-readable). An EMPTY array means
 * the list is safe to ship. Never throws.
 */
export function validateRankedList(input: ValidateListInput): string[] {
  const { list, excludedTopValue, meta } = input;
  const v: string[] = [];

  if (list.length < TT_LIST_SIZE) {
    v.push(`list has ${list.length} players, expected at least ${TT_LIST_SIZE}`);
  }

  // group by rank
  const byRank = new Map<number, RankedPlayer[]>();
  for (const p of list) {
    (byRank.get(p.rank) ?? byRank.set(p.rank, []).get(p.rank)!).push(p);
  }
  const maxRank = list.length > 0 ? Math.max(...list.map((p) => p.rank)) : 0;

  // 1. rank structure: {1..maxRank} present, each below the cutoff exactly once,
  //    cutoff rank ≥1 (may tie), maxRank within bounds.
  if (maxRank > TT_LIST_SIZE) v.push(`max rank ${maxRank} exceeds ${TT_LIST_SIZE}`);
  for (let r = 1; r < maxRank; r++) {
    const c = byRank.get(r)?.length ?? 0;
    if (c === 0) v.push(`rank ${r} is missing (ranks must be contiguous 1..${maxRank})`);
    else if (c > 1) v.push(`rank ${r} has ${c} players (only the cutoff rank ${maxRank} may tie)`);
  }
  if ((byRank.get(maxRank)?.length ?? 0) < 1) v.push(`cutoff rank ${maxRank} has no players`);

  // 2. values: positive finite; equal within a rank; non-increasing across ranks.
  for (const p of list) {
    if (!Number.isFinite(p.value) || p.value <= 0) {
      v.push(`rank ${p.rank}: value ${p.value} is not a positive finite number`);
    }
  }
  for (const [r, ps] of byRank) {
    const vals = new Set(ps.map((p) => p.value));
    if (vals.size > 1) v.push(`rank ${r}: tied players have different values (${[...vals].join(" / ")})`);
  }
  const repsByRank = [...byRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, ps]) => ({ rank: r, value: ps[0]!.value }));
  for (let i = 1; i < repsByRank.length; i++) {
    if (repsByRank[i]!.value > repsByRank[i - 1]!.value) {
      v.push(`rank ${repsByRank[i]!.rank}: value ${repsByRank[i]!.value} > previous rank's ${repsByRank[i - 1]!.value}`);
    }
  }

  // 3. CUTOFF COMPLETENESS — the lasting fix. Every player tied at the cutoff value
  //    must be in the list, i.e. the best excluded value is strictly below it. (If a
  //    tied player were excluded, naming them would be a correct answer marked wrong.)
  const cutoffValue = byRank.get(maxRank)?.[0]?.value;
  if (cutoffValue != null && excludedTopValue != null && excludedTopValue >= cutoffValue) {
    v.push(
      `incomplete cutoff tie: an excluded player has value ${excludedTopValue} ≥ the rank-${maxRank} value ${cutoffValue} — that tied player is a correct answer that would be marked wrong`,
    );
  }

  // 4./5./6. identity, findability, Arabic name, distinctness (whole list).
  const seenIds = new Set<string>();
  const nameCounts = new Map<string, number>();
  for (const p of list) {
    if (seenIds.has(p.playerId)) v.push(`duplicate player id ${p.playerId} in the list`);
    seenIds.add(p.playerId);

    const m = meta.get(p.playerId);
    if (!m) {
      v.push(`rank ${p.rank}: player ${p.playerId} is missing from football.players`);
      continue;
    }
    if (!m.active) {
      v.push(`rank ${p.rank}: player ${p.playerId} is inactive — the search input can't find them`);
    }
    const ar = (m.nameAr ?? "").trim();
    if (ar === "") {
      v.push(`rank ${p.rank}: player ${p.playerId} has no Arabic name`);
    } else {
      nameCounts.set(ar, (nameCounts.get(ar) ?? 0) + 1);
    }
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) v.push(`duplicate Arabic display name "${name}" appears ${count}× in the list`);
  }

  return v;
}
