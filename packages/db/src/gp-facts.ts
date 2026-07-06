import {
  canonicalCountry,
  isYouthOrReserveTeamName,
  parseTrophySeason,
  GP_TIER_SCORE_RANGE,
  KNOWN_EXTRA_COUNTRIES,
  type GpDifficulty,
  type GpFactPack,
} from "@fb/guess-player-engine";
import { prisma } from "./client";
import { Prisma } from "./generated/client";

/**
 * Guess the Player — football-data read seam (PLATFORM_CONTRACTS §4).
 *
 * The ONLY runtime football.* access for game #3. Read-only, raw SQL (always
 * schema-qualified — multiSchema does not route $queryRaw), loaded ONCE per
 * round into a pure {@link GpFactPack}; the engine then answers every question
 * without touching the DB. The hidden player's identity stays server-side.
 *
 * Correctness provenance (verified 2026-07-05 against local AND prod):
 *  - player_team_seasons / player_trophies come from the completed
 *    /players/teams + /trophies import: football._apifootball_import_progress
 *    shows status='ok' for ALL 8,228 players on both endpoints. That table is
 *    LOCAL-ONLY today, so completeness flags degrade to FALSE (⇒ the engine
 *    answers UNKNOWN, never a false NO) wherever it is absent — replicating it
 *    to prod is a deploy-phase step.
 *  - team_name → clubs mapping is total (3,373/3,373 and 3,802/3,802 distinct
 *    names match by lower(name)); the audit script re-verifies this.
 *  - Pre-2010 player_season_stats rows may carry league_id NULL; any season
 *    containing such a row is excluded from the competition "NO" gate.
 */

const seasonRange = (min: number, max: number | null) =>
  max === null
    ? Prisma.sql`floor(ps.score) >= ${min}`
    : Prisma.sql`floor(ps.score) >= ${min} AND floor(ps.score) <= ${max}`;

/** VS_SYSTEM hidden-player pool for a tier (active players only). A player
 *  with zero recorded club facts is never dealt — the round would dead-end
 *  with UNKNOWNs (currently exactly 1 of 3,938 eligible players). */
export async function gpVsSystemPoolIds(difficulty: GpDifficulty): Promise<string[]> {
  const { min, max } = GP_TIER_SCORE_RANGE[difficulty];
  const notCountryClub = await clubNameExclusion();
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id
    FROM football.players p
    JOIN football.player_score ps ON ps.player_id = p.id
    WHERE p.active = true AND ${seasonRange(min, max)}
      AND EXISTS (
        SELECT 1 FROM football.player_team_seasons ts
        JOIN football.clubs c ON lower(c.name) = lower(ts.team_name) AND c.kind = 'CLUB'
          AND ${notCountryClub}
        WHERE ts.player_id = p.id
      )
  `);
  return rows.map((r) => r.id);
}

/**
 * League ids that plausibly correspond to a trophy's competition — the
 * OPTIONAL narrowing aid for TROPHY_WITH_CLUB. Name must match; when both
 * sides carry a real country it must match too (same-named competitions in
 * different countries must never cross-narrow). Missing/loose ids only ever
 * degrade an answer to UNKNOWN, never flip it (engine invariant).
 */
export async function gpTrophyLeagueIds(compName: string, country: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ league_id: number; country: string }[]>(Prisma.sql`
    SELECT league_id, coalesce(country, '') AS country
    FROM football.competition_dim
    WHERE lower(comp_name) = lower(${compName})
  `);
  const c = country.trim().toLowerCase();
  return rows
    .filter((r) => {
      const rc = r.country.trim().toLowerCase();
      if (c === "" || rc === "" || c === "world" || rc === "world") return true;
      return rc === c;
    })
    .map((r) => r.league_id);
}

/** True when `football._apifootball_import_progress` exists AND records a
 *  completed run of `endpoint` for this player. The table is local-only until
 *  replicated to prod; where it is absent every flag is false and the engine
 *  degrades the affected negatives to UNKNOWN (never a false NO). The
 *  existence probe is a separate query — Postgres would reject a statement
 *  referencing a missing table at parse time, EXISTS or not. */
let progressTableKnown: boolean | null = null;
async function importCompleted(externalRef: number | null, endpoint: string): Promise<boolean> {
  if (externalRef === null) return false;
  if (progressTableKnown === null) {
    const probe = await prisma.$queryRaw<{ reg: string | null }[]>(
      Prisma.sql`SELECT to_regclass('football._apifootball_import_progress')::text AS reg`,
    );
    progressTableKnown = Boolean(probe[0]?.reg);
  }
  if (!progressTableKnown) return false;
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM football._apifootball_import_progress
      WHERE api_player_id = ${externalRef} AND endpoint = ${endpoint} AND status = 'ok'
    ) AS ok
  `);
  return rows[0]?.ok === true;
}

/** Canonical-country lookup set: nationalities ∪ national-team club rows.
 *  Returned as canonical-key → display spelling (nationalities preferred). */
let countryIndexCache: Map<string, string> | null = null;
async function loadCountryIndex(): Promise<Map<string, string>> {
  if (countryIndexCache) return countryIndexCache;
  countryIndexCache = await buildCountryIndex();
  return countryIndexCache;
}
async function buildCountryIndex(): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<{ name: string; src: string }[]>(Prisma.sql`
    SELECT name, 'nat' AS src FROM football.nationalities
    UNION ALL
    SELECT name, 'club' AS src FROM football.clubs WHERE kind = 'NATIONAL_TEAM'
  `);
  const index = new Map<string, string>();
  // nationalities first so their spelling wins as the display form.
  for (const r of rows.filter((r) => r.src === "nat")) index.set(canonicalCountry(r.name), r.name);
  for (const r of rows.filter((r) => r.src === "club")) {
    const k = canonicalCountry(r.name);
    if (!index.has(k)) index.set(k, r.name);
  }
  // Real countries with NTs that have no nationalities/club row in our data
  // (naturalized players' stints — e.g. Syria). Display = title-case-as-is.
  for (const extra of KNOWN_EXTRA_COUNTRIES) {
    const k = canonicalCountry(extra);
    if (!index.has(k)) {
      index.set(k, extra.replace(/\b\w/g, (ch) => ch.toUpperCase()));
    }
  }
  return index;
}

/**
 * kind=CLUB rows whose NAME is actually a country — importer misclassifi-
 * cations (verified 2026-07-05: "Ivory Coast", "South Korea", "China",
 * "Syria"; the alias spellings that didn't match the canonical NT rows).
 * They must never count as club facts: a hidden player's NT stint would leak
 * in as a "club" and break trophy-club attribution (Yaya Touré's 2008 UCL
 * looked like a two-club season). Data-driven — recomputed from the live
 * club list against the canonical country index, no hardcoded names. The
 * excluded names still flow into NT evidence via the team-season source.
 */
let countryLikeClubNamesCache: string[] | null = null;
export async function gpCountryLikeClubNames(): Promise<string[]> {
  if (countryLikeClubNamesCache) return countryLikeClubNamesCache;
  const index = await loadCountryIndex();
  const clubs = await prisma.$queryRaw<{ name: string }[]>(
    Prisma.sql`SELECT name FROM football.clubs WHERE kind = 'CLUB'`,
  );
  countryLikeClubNamesCache = clubs
    .map((c) => c.name)
    .filter((n) => index.has(canonicalCountry(n)));
  return countryLikeClubNamesCache;
}

/** SQL fragment: excludes country-named pseudo-clubs from a club join on
 *  alias `c`. Empty exclusion list ⇒ no-op TRUE. */
async function clubNameExclusion(): Promise<Prisma.Sql> {
  const names = await gpCountryLikeClubNames();
  if (names.length === 0) return Prisma.sql`TRUE`;
  return Prisma.sql`lower(c.name) NOT IN (${Prisma.join(names.map((n) => n.toLowerCase()))})`;
}

/** Load the full fact snapshot for one player. Throws when the player id is
 *  unknown — a round must never start on a phantom id. */
export async function loadGpFactPack(playerId: string): Promise<GpFactPack> {
  const players = await prisma.$queryRaw<
    { id: string; name: string; name_ar: string | null; external_ref: number | null; nat: string }[]
  >(Prisma.sql`
    SELECT p.id, p.name, p.name_ar, p.external_ref, n.name AS nat
    FROM football.players p
    JOIN football.nationalities n ON n.id = p.nationality_id
    WHERE p.id = ${playerId}::uuid
  `);
  const player = players[0];
  if (!player) throw new Error(`gp-facts: unknown player id ${playerId}`);

  const notCountryClub = await clubNameExclusion();
  const [clubSeasonRows, careerClubRows, ntClubRows, ntStatNames, tsNames, statLines, trophyRows] =
    await Promise.all([
      // (club, season) — kind=CLUB only; the name join is verified-total.
      prisma.$queryRaw<{ club_id: string; season: number }[]>(Prisma.sql`
        SELECT c.id AS club_id, ts.season
        FROM football.player_team_seasons ts
        JOIN football.clubs c ON lower(c.name) = lower(ts.team_name) AND c.kind = 'CLUB'
          AND ${notCountryClub}
        WHERE ts.player_id = ${playerId}::uuid
      `),
      // Career club list (no years — from_year/to_year are unpopulated).
      prisma.$queryRaw<{ club_id: string }[]>(Prisma.sql`
        SELECT pc.club_id
        FROM football.player_clubs pc
        JOIN football.clubs c ON c.id = pc.club_id AND c.kind = 'CLUB'
          AND ${notCountryClub}
        WHERE pc.player_id = ${playerId}::uuid
      `),
      // NT source (a): curated senior national-team link rows.
      prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
        SELECT c.name
        FROM football.player_national_teams pn
        JOIN football.clubs c ON c.id = pn.club_id AND c.kind = 'NATIONAL_TEAM'
        WHERE pn.player_id = ${playerId}::uuid
      `),
      // NT source (b): stat lines in NATIONAL_SENIOR competitions.
      prisma.$queryRaw<{ team_name: string }[]>(Prisma.sql`
        SELECT DISTINCT s.team_name
        FROM football.player_season_stats s
        JOIN football.competition_dim d ON d.league_id = s.league_id AND d.category = 'NATIONAL_SENIOR'
        WHERE s.player_id = ${playerId}::uuid AND s.team_name IS NOT NULL
      `),
      // NT source (c): team-season names (filtered against the country index).
      prisma.$queryRaw<{ team_name: string }[]>(Prisma.sql`
        SELECT DISTINCT team_name FROM football.player_team_seasons
        WHERE player_id = ${playerId}::uuid AND team_name IS NOT NULL
      `),
      // Season-stat lines: competitions + club attribution evidence.
      prisma.$queryRaw<
        { season: number; league_id: number | null; club_id: string | null }[]
      >(Prisma.sql`
        SELECT s.season, s.league_id, c.id AS club_id
        FROM football.player_season_stats s
        LEFT JOIN football.clubs c ON lower(c.name) = lower(s.team_name) AND c.kind = 'CLUB'
          AND ${notCountryClub}
        WHERE s.player_id = ${playerId}::uuid
      `),
      // Trophies WON; blank seasons excluded (proven duplicates of dated rows).
      prisma.$queryRaw<{ comp_name: string; country: string; season: string }[]>(Prisma.sql`
        SELECT league AS comp_name, coalesce(country, '') AS country, season
        FROM football.player_trophies
        WHERE player_id = ${playerId}::uuid AND place = 'Winner'
          AND season IS NOT NULL AND season <> ''
      `),
    ]);

  // Competition totals carry the resolved pre-2010 lines too — the raw stat
  // lines alone under-count "ever" facts.
  const compTotalsRows = await prisma.$queryRaw<{ league_id: number }[]>(Prisma.sql`
    SELECT DISTINCT league_id FROM football.player_competition_totals
    WHERE player_id = ${playerId}::uuid
  `);

  const countryIndex = await loadCountryIndex();
  const ntCandidates = [
    ...ntClubRows.map((r) => r.name),
    ...ntStatNames.map((r) => r.team_name),
    ...tsNames.map((r) => r.team_name),
  ];
  const ntCountries = new Map<string, string>();
  for (const raw of ntCandidates) {
    if (isYouthOrReserveTeamName(raw)) continue;
    const display = countryIndex.get(canonicalCountry(raw));
    if (display) ntCountries.set(canonicalCountry(raw), display);
  }

  const clubSeasons = clubSeasonRows.map((r) => ({ clubId: r.club_id, season: r.season }));
  const clubIdsEver = [
    ...new Set([...careerClubRows.map((r) => r.club_id), ...clubSeasons.map((c) => c.clubId)]),
  ];

  const seasonsWithNullLeague = new Set(
    statLines.filter((l) => l.league_id === null).map((l) => l.season),
  );
  const competitionSeasons = dedupePairs(
    statLines
      .filter((l): l is { season: number; league_id: number; club_id: string | null } =>
        l.league_id !== null,
      )
      .map((l) => ({ leagueId: l.league_id, season: l.season })),
  );
  const seasonsWithCompleteCompetitionData = [
    ...new Set(statLines.map((l) => l.season)),
  ].filter((s) => !seasonsWithNullLeague.has(s));

  const [teamsComplete, trophiesImported] = await Promise.all([
    importCompleted(player.external_ref, "teams"),
    importCompleted(player.external_ref, "trophies"),
  ]);

  return {
    playerId: player.id,
    name: player.name,
    nameAr: player.name_ar,
    nationalityName: player.nat,
    clubIdsEver,
    clubSeasons,
    seasonsWithClubData: [...new Set(clubSeasons.map((c) => c.season))],
    nationalTeamCountries: [...ntCountries.values()],
    nationalTeamsComplete: teamsComplete,
    competitionIdsEver: [
      ...new Set([...compTotalsRows.map((r) => r.league_id), ...competitionSeasons.map((c) => c.leagueId)]),
    ],
    competitionSeasons,
    seasonsWithCompleteCompetitionData,
    seasonLines: statLines
      .filter(
        (l): l is { season: number; league_id: number; club_id: string } =>
          l.league_id !== null && l.club_id !== null,
      )
      .map((l) => ({ leagueId: l.league_id, clubId: l.club_id, season: l.season })),
    trophies: trophyRows.map((t) => ({
      compName: t.comp_name,
      country: t.country,
      season: parseTrophySeason(t.season),
    })),
    trophiesImported,
  };
}

function dedupePairs(pairs: { leagueId: number; season: number }[]) {
  const seen = new Set<string>();
  const out: { leagueId: number; season: number }[] = [];
  for (const p of pairs) {
    const k = `${p.leagueId}:${p.season}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}
