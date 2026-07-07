/**
 * Guess the Player (خمن اللاعب) — engine types.
 *
 * ZERO-ERROR CONTRACT: a question is NEVER free text at this layer. The web
 * composer renders a natural Arabic sentence, but the client submits a
 * TEMPLATE + entity ids selected from autocomplete (the Top Ten search
 * pattern), so there is nothing to parse and nothing to misinterpret.
 * Forbidden topics (playing position, physical appearance) are enforced by
 * ABSENCE: no template references them and the FactPack does not carry them.
 *
 * Answers are three-valued. YES/NO are returned only when the data PROVES
 * them (per-domain completeness gates, see verify.ts); anything unprovable
 * is UNKNOWN ("لا يمكن الإجابة") and, per the locked rules, the asker's turn
 * is not consumed.
 */

export type GpAnswer = "YES" | "NO" | "UNKNOWN";

export type GpDifficulty = "EASY" | "MEDIUM" | "HARD";

/** Trophy identity = trophy_dim's primary key (comp_name, country).
 *  `leagueIds` is an OPTIONAL resolution aid (competition_dim rows matching
 *  this trophy's competition) used only to narrow TROPHY_WITH_CLUB ambiguity;
 *  absence merely means "no narrowing available", never a wrong answer.
 *  `altKeys` are EQUIVALENT identities for the same real trophy — the source
 *  data records e.g. the World Cup under both "World Cup" and "FIFA World
 *  Cup" (winners split 19/72), so a win under ANY equivalent string counts.
 *  Curated via the whitelist's merged_into rows (zero-error fix 2026-07-06). */
export interface GpTrophyRef {
  compName: string;
  country: string;
  leagueIds?: number[];
  altKeys?: { compName: string; country: string }[];
}

export type GpQuestion =
  /** هل لعب في نادي X؟ (ever, career-wide) */
  | { template: "CLUB_EVER"; clubId: string }
  /** هل لعب لنادي X في موسم Y؟ (season = API start year, e.g. 2018 = 2018/19) */
  | { template: "CLUB_SEASON"; clubId: string; season: number }
  /** هل جنسيته X؟ — compared by CANONICAL country name (the nationalities
   *  table contains near-duplicates like Czechia/Czech Republic) */
  | { template: "NATIONALITY"; countryName: string }
  /** هل لعب لمنتخب X؟ (senior national team) */
  | { template: "NATIONAL_TEAM"; countryName: string }
  /** هل هو من قارة X؟ — the football CONFEDERATION the player's country
   *  competes under (rule, not geography: Russia/Türkiye → UEFA, Australia →
   *  AFC). The FactPack carries the hidden player's confederation resolved
   *  from the curated football.country_confederations table. */
  | { template: "CONTINENT"; confederation: string }
  /** هل لعب في بطولة X؟ (league / cup / tournament, ever). `altLeagueIds` are
   *  EQUIVALENT ids for the same real competition (API renames) — appearing
   *  under ANY equivalent id counts (mirrors trophy altKeys; curated data). */
  | { template: "COMPETITION_EVER"; leagueId: number; altLeagueIds?: number[] }
  /** هل لعب في بطولة X موسم Y؟ */
  | { template: "COMPETITION_SEASON"; leagueId: number; season: number; altLeagueIds?: number[] }
  /** هل فاز بلقب X؟ */
  | { template: "TROPHY_EVER"; trophy: GpTrophyRef }
  /** هل فاز بلقب X في موسم Y؟ */
  | { template: "TROPHY_SEASON"; trophy: GpTrophyRef; season: number }
  /** هل فاز بلقب X مع نادي Y؟ — answered only when the winning club is
   *  unambiguously attributable; otherwise UNKNOWN. */
  | { template: "TROPHY_WITH_CLUB"; trophy: GpTrophyRef; clubId: string };

export type GpTemplate = GpQuestion["template"];

/** All templates, for exhaustive validation at the socket boundary. */
export const GP_TEMPLATES: readonly GpTemplate[] = [
  "CLUB_EVER",
  "CLUB_SEASON",
  "NATIONALITY",
  "NATIONAL_TEAM",
  "COMPETITION_EVER",
  "COMPETITION_SEASON",
  "TROPHY_EVER",
  "TROPHY_SEASON",
  "TROPHY_WITH_CLUB",
] as const;

/** One (club, season) membership fact — from football.player_team_seasons,
 *  club-name-joined to football.clubs (verified: 100% of names map). */
export interface GpClubSeason {
  clubId: string;
  season: number;
}

/** One (competition, season) fact — from football.player_season_stats rows
 *  with a known league_id. */
export interface GpCompetitionSeason {
  leagueId: number;
  season: number;
}

/** One season-stat line with both the competition and (when the team is a
 *  real club) the club — the TROPHY_WITH_CLUB narrowing evidence. */
export interface GpSeasonLine {
  leagueId: number;
  clubId: string | null;
  season: number;
}

/** One trophy WON (place='Winner'; blank-season API duplicates excluded).
 *  `season` is the parsed start year; null when the raw text is unparseable
 *  (the engine then refuses to prove season-specific negatives). */
export interface GpTrophyWin {
  compName: string;
  country: string;
  season: number | null;
}

/**
 * Everything the engine may know about the hidden player, loaded ONCE at
 * round start (server-side only — the identity never reaches clients before
 * reveal). Pure data, JSON-serializable, no I/O: every answer is a pure
 * function of (question, FactPack), which is what makes the engine
 * exhaustively testable.
 *
 * Deliberately ABSENT: position, height, weight, photo — the forbidden
 * topics cannot be asked because the data to answer them never enters here.
 */
export interface GpFactPack {
  playerId: string;
  /** Display only (reveal screen / spot-check CLI). */
  name: string;
  nameAr: string | null;
  /** Canonical country name of players.nationality_id (always present). */
  nationalityName: string;
  /** The football confederation the nationality competes under (UEFA/AFC/CAF/
   *  CONMEBOL/CONCACAF/OFC), from the curated country_confederations table.
   *  null/absent = country not (yet) in the curated mapping → CONTINENT
   *  answers UNKNOWN (zero-error: never guess geography). Optional so frozen
   *  fixtures/packs from before the field exist stay valid. */
  confederation?: string | null;
  /** Clubs ever played for (kind=CLUB): player_clubs ∪ mapped team-seasons. */
  clubIdsEver: string[];
  /** Per-season club memberships (kind=CLUB). */
  clubSeasons: GpClubSeason[];
  /** Seasons with >=1 recorded club — the CLUB_SEASON "NO" gate: a NO is
   *  only provable for a season we can see him playing somewhere. */
  seasonsWithClubData: number[];
  /** Canonical senior national-team countries (youth/"B" teams filtered out,
   *  names alias-normalized and validated against the country list). */
  nationalTeamCountries: string[];
  /** True when the career/teams import completed for this player — the
   *  NATIONAL_TEAM "NO" gate. */
  nationalTeamsComplete: boolean;
  /** Competitions ever appeared in (league ids). */
  competitionIdsEver: number[];
  /** Per-season competition appearances (known league_id only). */
  competitionSeasons: GpCompetitionSeason[];
  /** Seasons where ALL of the player's stat lines have a known league_id —
   *  the COMPETITION_SEASON "NO" gate. A season containing any unresolved
   *  (null-league) line can never prove a negative. */
  seasonsWithCompleteCompetitionData: number[];
  /** Season lines for trophy-club attribution narrowing. */
  seasonLines: GpSeasonLine[];
  /** Trophies won. */
  trophies: GpTrophyWin[];
  /** True when the trophies import completed for this player — the gate for
   *  every trophy "NO". False ⇒ trophy questions answer UNKNOWN, never a
   *  false NO. */
  trophiesImported: boolean;
}
