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
import {
  TT_CLUBS,
  TT_GATE,
  TT_TOP5_LEAGUE_IDS,
  TT_TYPE_META,
  TT_UCL_LEAGUE_ID,
  type TtClub,
  type TtQuestionType,
} from "@fb/shared";
import { evaluateGate, type CandidateRow } from "@fb/top-10-engine";

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
  // ROUND to a whole number: accurate passes is a count (no fractional pass), and an
  // integer value is order-independent so a multi-season window sum is exact (no
  // float drift between the builder and the audit).
  ACCURATE_PASSES:
    "ROUND(SUM(CASE WHEN s.passes_accuracy IS NULL THEN NULL ELSE s.passes_total * LEAST(GREATEST(s.passes_accuracy, 0), 100) / 100.0 END))",
  GK_CLEAN_SHEETS: "NULL", // dormant
  // ALL-PLAYERS variants — identical expressions; the position scope (none) is driven
  // by TT_TYPE_META[type].position, not by this expression.
  KEY_PASSES_ALL: "SUM(s.passes_key)",
  ACCURATE_PASSES_ALL:
    "ROUND(SUM(CASE WHEN s.passes_accuracy IS NULL THEN NULL ELSE s.passes_total * LEAST(GREATEST(s.passes_accuracy, 0), 100) / 100.0 END))",
  SHOTS_TOTAL: "SUM(s.shots_total)",
  SHOTS_ON: "SUM(s.shots_on)",
  DRIBBLES_SUCCESS: "SUM(s.dribbles_success)",
  GK_SAVES: "SUM(s.goals_saves)", // position=GK applied via TT_TYPE_META
};

// ---- season WINDOWS (single + multi-season cumulative ranges) ----------------

/** Window sizes generated: single season + 2- and 3-season cumulative ranges. */
export const WINDOW_SIZES = [1, 2, 3] as const;

/** One aggregated stat line per (league, season, player) — the builder/audit query
 *  this once per type, then fold it into windows in memory (so a window's value is the
 *  true SUM over its seasons, and clubs within each season). */
export interface SeasonRow {
  leagueId: number;
  season: number;
  playerId: string;
  /** API team_id — used to filter a row to a single club for club-scoped questions. */
  teamId: number;
  value: number | null;
  apps: number;
  fame: number;
  name: string;
  nameAr: string | null;
}

/**
 * Build a window [start..end] for ONE league: sum each player's value + appearances
 * over the seasons in range. `value` stays null only if the player has NO non-null
 * season in the window (so the completeness gate still measures real coverage).
 */
export function aggregateWindow(leagueRows: readonly SeasonRow[], start: number, end: number): CandidateRow[] {
  const byPlayer = new Map<string, { value: number; has: boolean; apps: number; fame: number; name: string; nameAr: string | null }>();
  for (const r of leagueRows) {
    if (r.season < start || r.season > end) continue;
    const e = byPlayer.get(r.playerId) ?? { value: 0, has: false, apps: 0, fame: r.fame, name: r.name, nameAr: r.nameAr };
    if (r.value != null) {
      e.value += Number(r.value);
      e.has = true;
    }
    e.apps += r.apps;
    byPlayer.set(r.playerId, e);
  }
  return [...byPlayer.entries()].map(([playerId, e]) => ({
    playerId,
    value: e.has ? e.value : null,
    appearances: e.apps,
    fame: e.fame,
    name: e.name,
    nameAr: e.nameAr ?? e.name,
  }));
}

// ---- variety SCOPE (competition × club) — shared by builder + audit ---------

/** The scope kinds a catalog entry can have. COMP = one competition; TOP5 = the five
 *  big leagues combined; CLUB_* = one club within its league / the UCL / all its comps. */
export type TtScopeKind = "COMP" | "TOP5" | "CLUB_LEAGUE" | "CLUB_UCL" | "CLUB_ALL";

export const isClubScope = (k: TtScopeKind): boolean =>
  k === "CLUB_LEAGUE" || k === "CLUB_UCL" || k === "CLUB_ALL";

/** A club's squad is small, so the competition-wide ≥20-qualifiers gate over-rejects
 *  valid club lists. ≥10 positive values is still required (a clean 10-rank list needs
 *  10 distinct values regardless) — completeness is still enforced via regulars-fill. */
export const TT_CLUB_MIN_QUALIFIERS = 10;

/** The exact set of league_ids a stored scope aggregates over. The audit re-derives the
 *  identical set from (scope, leagueId, clubKey) so its check matches what shipped. For
 *  a club, `leagueId` carries the club's domestic-league id. */
export function scopeLeagueIds(kind: TtScopeKind, leagueId: number): number[] {
  switch (kind) {
    case "COMP":
      return [leagueId];
    case "TOP5":
      return [...TT_TOP5_LEAGUE_IDS];
    case "CLUB_LEAGUE":
      return [leagueId];
    case "CLUB_UCL":
      return [TT_UCL_LEAGUE_ID];
    case "CLUB_ALL":
      // A club's "all competitions" in our data = its domestic league + the Champions
      // League (national-team comps belong to national teams, not the club).
      return [leagueId, TT_UCL_LEAGUE_ID];
  }
}

/** Resolve a stored club_key to its registry entry (team_id + league + Arabic name). */
export const clubByKey = (key: string | null | undefined): TtClub | undefined =>
  key ? TT_CLUBS.find((c) => c.key === key) : undefined;

/** Rows belonging to a scope: league in `leagueIds`, and (if club-scoped) team == club. */
export function scopeSubset(
  rows: readonly SeasonRow[],
  leagueIds: ReadonlySet<number>,
  clubTeamId: number | null,
): SeasonRow[] {
  return rows.filter((r) => leagueIds.has(r.leagueId) && (clubTeamId == null || r.teamId === clubTeamId));
}

/** A single season's DATA is complete for a (type, league) when its regulars are (almost)
 *  fully populated — the completeness proxy, INDEPENDENT of how many qualifiers there are.
 *  Every season inside a window must be data-complete, so a cumulative range never sums a
 *  partial season (the window itself must still pass the full gate to admit). */
export function isSeasonDataComplete(seasonCandidates: readonly CandidateRow[]): boolean {
  const m = evaluateGate(seasonCandidates).metrics;
  return m.regulars > 0 && m.regularsFillPct >= TT_GATE.regularsFillMin;
}

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

/** Values above the type's reviewed ceiling (wrong column / unit). The ceiling is a
 *  PER-SEASON max, so for an N-season cumulative window it scales to sanityMax × N.
 *  Empty = OK. */
export function valueSanityViolations(
  type: TtQuestionType,
  players: ReadonlyArray<{ rank: number; value: number }>,
  seasons = 1,
): string[] {
  const max = TT_TYPE_META[type].sanityMax * Math.max(1, seasons);
  const out: string[] = [];
  for (const p of players) {
    if (!(p.value > 0) || p.value > max) {
      out.push(`rank ${p.rank}: value ${p.value} outside (0, ${max}] for ${type} over ${seasons} season(s) (wrong column / unit?)`);
    }
  }
  return out;
}
