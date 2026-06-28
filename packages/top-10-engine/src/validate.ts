/**
 * Catalog-list INTEGRITY VALIDATOR (pure). The single source of truth for "is this
 * Top-10 list safe to show a contestant?". A failing list is a direct threat to the
 * game — a contestant who gives a correct answer must NEVER be told "wrong", and the
 * information on every revealed card must be correct and findable. The catalog
 * builder runs this on every list and REFUSES to ship any that fails; the audit tool
 * runs the same check against the live catalog. Pure: the caller supplies the
 * already-fetched football metadata (this package never touches the DB).
 *
 * Rules enforced (any violation ⇒ the list must not ship):
 *   1. Exactly TT_LIST_SIZE players, ranks contiguous 1..N.
 *   2. Every value is finite and > 0, and values are non-increasing by rank.
 *   3. NO boundary tie: the 10th value is strictly greater than the 11th (best
 *      excluded) value — otherwise the cutoff is ambiguous (the game-killer).
 *   4. No duplicate player id in the list.
 *   5. Every listed player exists in football.players, is `active` (so the search
 *      input can find them), and has a non-empty Arabic name (the contestant plays
 *      in Arabic and the card must show a correct Arabic name).
 *   6. No two cards share the same Arabic display name (each must be distinct).
 *
 * NOTE on internal ties: two players tied on value but at different ranks is NOT a
 * violation — both are legitimately in the Top-10, so revealing either is a correct
 * answer; only the order among equals (and thus the points) is decided by the
 * deterministic tiebreak. Only a tie AT THE CUTOFF (rule 3) can mark a correct
 * answer wrong, so that alone is rejected.
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
  /** The built Top-10 (ranked 1..N). */
  list: readonly RankedPlayer[];
  /** Value of the best EXCLUDED candidate (11th place); null if ≤10 candidates. */
  eleventhValue: number | null;
  /** playerId → football metadata (name_ar, active). */
  meta: ReadonlyMap<string, ListPlayerMeta>;
}

/**
 * Returns the list of integrity violations (human-readable). An EMPTY array means
 * the list is safe to ship. Never throws.
 */
export function validateRankedList(input: ValidateListInput): string[] {
  const { list, eleventhValue, meta } = input;
  const v: string[] = [];

  // 1. size + contiguous ranks
  if (list.length !== TT_LIST_SIZE) {
    v.push(`list has ${list.length} players, expected ${TT_LIST_SIZE}`);
  }
  list.forEach((p, i) => {
    if (p.rank !== i + 1) v.push(`rank at index ${i} is ${p.rank}, expected ${i + 1}`);
  });

  // 2. values finite, positive, non-increasing
  for (let i = 0; i < list.length; i++) {
    const val = list[i]!.value;
    if (!Number.isFinite(val) || val <= 0) {
      v.push(`rank ${list[i]!.rank}: value ${val} is not a positive finite number`);
    }
    if (i > 0 && list[i]!.value > list[i - 1]!.value) {
      v.push(`rank ${list[i]!.rank}: value ${list[i]!.value} > previous rank's ${list[i - 1]!.value}`);
    }
  }

  // 3. boundary tie — the game-killer
  if (
    list.length === TT_LIST_SIZE &&
    eleventhValue != null &&
    list[TT_LIST_SIZE - 1]!.value <= eleventhValue
  ) {
    v.push(
      `boundary tie: 10th value ${list[TT_LIST_SIZE - 1]!.value} is not strictly greater than the 11th value ${eleventhValue} (ambiguous cutoff — an excluded tied player would be a correct answer marked wrong)`,
    );
  }

  // 4./5./6. per-player identity, findability, Arabic name, distinctness
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
