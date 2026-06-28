/**
 * Catalog-list INTEGRITY VALIDATOR (pure). The single source of truth for "is this
 * list safe to put in front of a contestant?". A failing list is a direct threat to
 * the game — a correct answer must NEVER be marked "wrong", and every revealed card
 * must show correct, findable information. The catalog builder runs this on every
 * list and REFUSES to ship any that fails; the audit tool runs the same check
 * against the live catalog. Pure: the caller supplies already-fetched football
 * metadata (this package never touches the DB).
 *
 * The list is the TOP-10 DISTINCT VALUES, dense-ranked 1..10, with every player tied
 * at a value stored at that rank. Ties are valid at ANY rank (the runtime cascade /
 * bonus logic resolves how tied players score) — the validator only ensures the data
 * is sound and complete.
 *
 * Rules enforced (any violation ⇒ the list must not ship):
 *   1. Exactly 10 distinct ranks present: {1..10}, no gaps. (≥10 distinct values.)
 *   2. Every value is finite and > 0; players sharing a rank share one value; each
 *      rank's value is strictly greater than the next rank's (distinct per rank).
 *   3. BOTTOM COMPLETENESS: the best EXCLUDED value is strictly below the rank-10
 *      value — so every player tied at the 10th value is included (none dropped).
 *   4. No duplicate player id in the list.
 *   5. Every listed player exists in football.players, is `active` (findable in the
 *      search input), and has a non-empty Arabic name.
 *   6. No two cards share the same Arabic display name.
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
  /** The built answer list (dense ranks 1..10; ties allowed at any rank). */
  list: readonly RankedPlayer[];
  /** Highest value among EXCLUDED players (the 11th distinct value); null if none. */
  excludedTopValue: number | null;
  /** playerId → football metadata (name_ar, active). */
  meta: ReadonlyMap<string, ListPlayerMeta>;
}

/** Returns the integrity violations (human-readable). EMPTY ⇒ safe to ship. */
export function validateRankedList(input: ValidateListInput): string[] {
  const { list, excludedTopValue, meta } = input;
  const v: string[] = [];

  // group by rank
  const byRank = new Map<number, RankedPlayer[]>();
  for (const p of list) {
    (byRank.get(p.rank) ?? byRank.set(p.rank, []).get(p.rank)!).push(p);
  }

  // 1. exactly the ranks {1..TT_LIST_SIZE}, no gaps.
  for (let r = 1; r <= TT_LIST_SIZE; r++) {
    if (!byRank.has(r)) v.push(`rank ${r} is missing (need ${TT_LIST_SIZE} distinct values, ranks 1..${TT_LIST_SIZE})`);
  }
  for (const r of byRank.keys()) {
    if (r < 1 || r > TT_LIST_SIZE) v.push(`rank ${r} is out of range 1..${TT_LIST_SIZE}`);
  }

  // 2. values: positive finite; one value per rank; strictly decreasing across ranks.
  for (const p of list) {
    if (!Number.isFinite(p.value) || p.value <= 0) {
      v.push(`rank ${p.rank}: value ${p.value} is not a positive finite number`);
    }
  }
  for (const [r, ps] of byRank) {
    const vals = new Set(ps.map((p) => p.value));
    if (vals.size > 1) v.push(`rank ${r}: players have different values (${[...vals].join(" / ")}) — a rank must be one value`);
  }
  const repsByRank = [...byRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, ps]) => ({ rank: r, value: ps[0]!.value }));
  for (let i = 1; i < repsByRank.length; i++) {
    if (repsByRank[i]!.value >= repsByRank[i - 1]!.value) {
      v.push(`rank ${repsByRank[i]!.rank}: value ${repsByRank[i]!.value} is not strictly below rank ${repsByRank[i - 1]!.rank}'s ${repsByRank[i - 1]!.value}`);
    }
  }

  // 3. BOTTOM COMPLETENESS — every player tied at the 10th value must be included.
  const tenthValue = repsByRank.find((x) => x.rank === TT_LIST_SIZE)?.value;
  if (tenthValue != null && excludedTopValue != null && excludedTopValue >= tenthValue) {
    v.push(
      `incomplete bottom rank: an excluded player has value ${excludedTopValue} ≥ the rank-${TT_LIST_SIZE} value ${tenthValue} — that tied player is a correct answer that would be marked wrong`,
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
