/**
 * Top Ten (توب 10) — shared domain contracts. Single source of truth for the
 * enums, competition whitelist, timing, scoring, XP, bot, and completeness-gate
 * constants used across the engine, the game-server, and the web app. These mirror
 * the Prisma enums in the `top_10` schema (packages/db/prisma/schema.prisma) and the
 * APPROVED build plan. Keep all tunables here so a change propagates everywhere.
 */

// ---- enums (mirror top_10.* Prisma enums) ----------------------------------

export const TT_QUESTION_TYPES = [
  "GOAL_SCORERS",
  "ASSISTS",
  "KEY_PASSES", // midfielders only
  "TACKLES",
  "ACCURATE_PASSES", // midfielders only
  "GK_CLEAN_SHEETS", // dormant (deferred D1) — no data yet; never admitted by the gate
  "KEY_PASSES_ALL", // all players (no position filter)
  "ACCURATE_PASSES_ALL", // all players (no position filter)
  "SHOTS_TOTAL", // all players
  "SHOTS_ON", // all players
  "DRIBBLES_SUCCESS", // all players
  "GK_SAVES", // goalkeepers only
] as const;
export type TtQuestionType = (typeof TT_QUESTION_TYPES)[number];

/**
 * The types the catalog actually generates. Each metric appears EXACTLY ONCE with its
 * fixed theme (metric + position) — variety comes from competition × club × time, never
 * from "all players vs a position" variants. KEY_PASSES_ALL / ACCURATE_PASSES_ALL are
 * therefore DORMANT (kept as enum values + metadata for the contract pin, but never
 * generated — they only duplicated KEY_PASSES / ACCURATE_PASSES at a different scope).
 * GK_CLEAN_SHEETS stays dormant until a clean-sheets column exists.
 */
export const TT_ACTIVE_QUESTION_TYPES: readonly TtQuestionType[] = [
  "GOAL_SCORERS",
  "ASSISTS",
  "KEY_PASSES", // midfielders
  "TACKLES", // defenders
  "ACCURATE_PASSES", // midfielders
  "SHOTS_TOTAL", // all players
  "SHOTS_ON", // all players
  "DRIBBLES_SUCCESS", // all players
  "GK_SAVES", // goalkeepers
];

export const TT_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type TtDifficulty = (typeof TT_DIFFICULTIES)[number];

export const TT_MATCH_KINDS = ["MANUAL", "QUICK_PLAY"] as const;
export type TtMatchKind = (typeof TT_MATCH_KINDS)[number];

export const TT_ROUND_MODES = ["NORMAL", "HINT"] as const;
export type TtRoundMode = (typeof TT_ROUND_MODES)[number];

export const TT_ROUND_END_REASONS = [
  "ALL_REVEALED",
  "UNANIMOUS_END",
  "TIMER",
  "WITHDRAWAL",
] as const;
export type TtRoundEndReason = (typeof TT_ROUND_END_REASONS)[number];

// ---- per-question-type metadata --------------------------------------------

/**
 * Single source of truth for each question type: the Arabic label shown to
 * contestants, its English meaning, the source metric, the position scope, and a
 * sanity ceiling. The catalog builder + audit both read `metric`/`position`/
 * `sanityMax` from here, and a CONTRACT TEST pins this whole table — so a silent
 * change to a label, column, scope, or bound (the class of bug that once showed
 * KEY_PASSES as "assists") is caught and must be deliberately reviewed.
 *
 * RULE when editing: `nameAr` MUST describe exactly what `metric` computes, including
 * the `position` scope. Verify the Arabic against the metric before changing either.
 */
export interface TtTypeMeta {
  /** Arabic label shown to contestants. Must match `metric` + `position` exactly. */
  readonly nameAr: string;
  readonly nameEn: string;
  /** Position code the ranking is restricted to (null = all outfield/any). */
  readonly position: "GK" | "DEF" | "MID" | "FWD" | null;
  /** Canonical source metric (documentation + contract pin). The builder's SQL must
   *  compute exactly this; the audit checks the catalog values against it. */
  readonly metric: string;
  /** Upper bound for a single (competition, season) value — a sanity ceiling that
   *  catches a wrong source column or unit mismatch (the value can never exceed it). */
  readonly sanityMax: number;
}

export const TT_TYPE_META: Record<TtQuestionType, TtTypeMeta> = {
  GOAL_SCORERS: {
    nameAr: "أكثر اللاعبين تسجيلاً للأهداف",
    nameEn: "Top goal scorers",
    position: null,
    metric: "SUM(goals_total) per competition-season",
    sanityMax: 80,
  },
  ASSISTS: {
    // "صناعة الأهداف" = assists (creating goals).
    nameAr: "أكثر اللاعبين صناعةً للأهداف",
    nameEn: "Top assist providers",
    position: null,
    metric: "SUM(goals_assists) per competition-season",
    sanityMax: 60,
  },
  KEY_PASSES: {
    // "تمريرات مفتاحية" = key passes (passes that lead to a shot). NOT "تمريرات حاسمة"
    // (= assists), the historical bug. Scoped to midfielders → the title says so.
    nameAr: "أكثر لاعبي الوسط تمريراتٍ مفتاحية",
    nameEn: "Top midfielders by key passes",
    position: "MID",
    metric: "SUM(passes_key) per competition-season, position=MID",
    sanityMax: 400,
  },
  TACKLES: {
    // "تدخلات" = tackles; scoped to defenders → the title says "المدافعين".
    nameAr: "أكثر المدافعين تدخلات",
    nameEn: "Top defenders by tackles",
    position: "DEF",
    metric: "SUM(tackles_total) per competition-season, position=DEF",
    sanityMax: 400,
  },
  ACCURATE_PASSES: {
    // "تمريرات دقيقة" = accurate passes = passes_total × accuracy%. Scoped to midfielders.
    nameAr: "أكثر لاعبي الوسط تمريراتٍ دقيقة",
    nameEn: "Top midfielders by accurate passes",
    position: "MID",
    metric: "SUM(passes_total × clamp(passes_accuracy,0,100)/100) per competition-season, position=MID",
    sanityMax: 5000,
  },
  GK_CLEAN_SHEETS: {
    nameAr: "أكثر الحراس نظافةً لشباكهم",
    nameEn: "Top goalkeepers by clean sheets",
    position: "GK",
    metric: "(dormant — no clean-sheets column yet)",
    sanityMax: 40,
  },
  KEY_PASSES_ALL: {
    // Same metric as KEY_PASSES but ALL positions → the title says "اللاعبين" (players).
    nameAr: "أكثر اللاعبين تمريراتٍ مفتاحية",
    nameEn: "Top players by key passes",
    position: null,
    metric: "SUM(passes_key) per competition-season",
    sanityMax: 400,
  },
  ACCURATE_PASSES_ALL: {
    // Same metric as ACCURATE_PASSES but ALL positions → the title says "اللاعبين".
    nameAr: "أكثر اللاعبين تمريراتٍ دقيقة",
    nameEn: "Top players by accurate passes",
    position: null,
    metric: "SUM(passes_total × clamp(passes_accuracy,0,100)/100) per competition-season",
    sanityMax: 5000,
  },
  SHOTS_TOTAL: {
    nameAr: "أكثر اللاعبين تسديدًا",
    nameEn: "Top players by total shots",
    position: null,
    metric: "SUM(shots_total) per competition-season",
    sanityMax: 350,
  },
  SHOTS_ON: {
    nameAr: "أكثر اللاعبين تسديدًا على المرمى",
    nameEn: "Top players by shots on target",
    position: null,
    metric: "SUM(shots_on) per competition-season",
    sanityMax: 200,
  },
  DRIBBLES_SUCCESS: {
    nameAr: "أكثر اللاعبين مراوغةً ناجحة",
    nameEn: "Top players by successful dribbles",
    position: null,
    metric: "SUM(dribbles_success) per competition-season",
    sanityMax: 350,
  },
  GK_SAVES: {
    // "تصديات" = saves; scoped to goalkeepers → the title says "الحراس".
    nameAr: "أكثر الحراس تصديًا",
    nameEn: "Top goalkeepers by saves",
    position: "GK",
    metric: "SUM(goals_saves) per competition-season, position=GK",
    sanityMax: 400,
  },
};

// ---- competition whitelist (VERIFIED league_ids) ---------------------------

export interface TtCompetition {
  readonly leagueId: number;
  readonly nameAr: string;
  readonly nameEn: string;
}

/** The only competitions Top Ten generates from (brief §6.3). league_ids verified
 *  against football.player_season_stats. Always filter `league_id IS NOT NULL` and
 *  to this set — legacy null-id rows duplicate data from another source/era. */
export const TT_COMPETITIONS: readonly TtCompetition[] = [
  { leagueId: 39, nameAr: "الدوري الإنجليزي", nameEn: "Premier League" },
  { leagueId: 140, nameAr: "الدوري الإسباني", nameEn: "La Liga" },
  { leagueId: 135, nameAr: "الدوري الإيطالي", nameEn: "Serie A" },
  { leagueId: 78, nameAr: "الدوري الألماني", nameEn: "Bundesliga" },
  { leagueId: 61, nameAr: "الدوري الفرنسي", nameEn: "Ligue 1" },
  { leagueId: 2, nameAr: "دوري أبطال أوروبا", nameEn: "UEFA Champions League" },
  { leagueId: 1, nameAr: "كأس العالم", nameEn: "FIFA World Cup" },
  { leagueId: 4, nameAr: "بطولة أمم أوروبا", nameEn: "UEFA Euro" },
  { leagueId: 9, nameAr: "كوبا أمريكا", nameEn: "Copa América" },
];

export const TT_WHITELIST_LEAGUE_IDS: readonly number[] = TT_COMPETITIONS.map((c) => c.leagueId);

/** The UEFA Champions League league_id — used as the "club in the Champions League"
 *  scope and as the second competition in a club's "all competitions" scope. */
export const TT_UCL_LEAGUE_ID = 2;

// ---- variety: grouped-competition scope (the five big European leagues) -----

/** "Top-5 European leagues" = England, Spain, Italy, Germany, France, combined into one
 *  ranked list. A non-club grouped-competition scope; a season ships only if ALL five
 *  leagues are individually complete (so the combined list is never missing a league). */
export const TT_TOP5_LEAGUE_IDS: readonly number[] = [39, 140, 135, 78, 61];
/** Honest Arabic label for the Top-5 scope shown in the question title. */
export const TT_TOP5_LABEL_AR = "الدوريات الأوروبية الخمس الكبرى";

// ---- variety: club scope (the only 9 clubs allowed for club-scoped questions) ----

export interface TtClub {
  /** Stable key stored on the catalog entry (club_key). */
  readonly key: string;
  /** Arabic display name used in the question title. */
  readonly nameAr: string;
  /** The club's API-Football team_id in football.player_season_stats (the senior team;
   *  reserve/youth sides are separate ids and are intentionally excluded). */
  readonly teamId: number;
  /** The club's domestic-league league_id (its "in the league" + "all competitions" scope). */
  readonly leagueId: number;
}

/**
 * Club-scoped questions are restricted to EXACTLY these 9 clubs (owner decision). Each
 * resolves to a single canonical team_id (verified against football.player_season_stats);
 * the title states the club, so the answer set is always that club's players only.
 */
export const TT_CLUBS: readonly TtClub[] = [
  { key: "BAR", nameAr: "برشلونة", teamId: 529, leagueId: 140 },
  { key: "RMA", nameAr: "ريال مدريد", teamId: 541, leagueId: 140 },
  { key: "MUN", nameAr: "مان يونايتد", teamId: 33, leagueId: 39 },
  { key: "LIV", nameAr: "ليفربول", teamId: 40, leagueId: 39 },
  { key: "CHE", nameAr: "تشيلسي", teamId: 49, leagueId: 39 },
  { key: "MCI", nameAr: "مان سيتي", teamId: 50, leagueId: 39 },
  { key: "ARS", nameAr: "أرسنال", teamId: 42, leagueId: 39 },
  { key: "BAY", nameAr: "بايرن ميونخ", teamId: 157, leagueId: 78 },
  { key: "PSG", nameAr: "باريس سان جيرمان", teamId: 85, leagueId: 61 },
];

// ---- structural constants --------------------------------------------------

export const TT_LIST_SIZE = 10;
export const TT_MIN_PLAYERS = 2;
export const TT_MAX_PLAYERS = 4;
export const TT_ROUNDS_PER_MATCH = 1; // a match is a single round

// ---- season display --------------------------------------------------------

/**
 * A stored `season` integer is API-Football's value = the season's START year
 * (VERIFIED against source data: e.g. Premier League season=2019 → Vardy's 2019/20
 * Golden Boot, not the 2018/19 list; La Liga season=2011 → Messi's 50-goal 2011/12).
 *
 * Cross-calendar competitions (the domestic leagues, the Champions League, and the
 * Top-5 grouping) run Aug→May, so season=YYYY means the YYYY/(YYYY+1) season and is
 * displayed as "2019/2020". The competitions BELOW are played inside a SINGLE
 * calendar year (summer tournaments), so their season=YYYY is that exact year and
 * must NOT be expanded (there is no "World Cup 2018/2019").
 */
export const TT_SINGLE_YEAR_LEAGUE_IDS: readonly number[] = [
  1, // FIFA World Cup
  4, // UEFA Euro
  9, // Copa América
];

/**
 * A national-team tournament FINALS runs at most this many matches (the 48-team
 * World Cup 2026 champion plays 8; Euro/Copa champions ≤ 7). For some seasons
 * API-Football bundles QUALIFYING into the tournament `league_id` (verified: Euro
 * 2020 → max 13 appearances; WC 2010/2014/2018 → 11/10/18), which makes the "finals"
 * answer list qualifying-based and misleading (e.g. a GK with 42 "Euro 2020 saves").
 * The catalog therefore rejects any TT_SINGLE_YEAR_LEAGUE_IDS season whose maximum
 * appearances exceed this cap — every contaminated season observed is ≥ 10, so the
 * 8↔10 gap is a safe margin that keeps clean finals (WC 2022, Euro 2024, all Copa).
 */
export const TT_TOURNAMENT_FINALS_MAX_APPS = 8;

/**
 * The contestant-facing season label for a stored window, keyed off the entry's
 * stored competition id. Cross-calendar → the real two-year span ("2019/2020");
 * single-year tournament → one year ("2018"). A cumulative window expands BOTH
 * endpoints ("2018/2019–2020/2021"). The label is derived from the SAME stored
 * `season`/`seasonEnd`/`leagueId` the answer list was computed from, so it can never
 * disagree with the data (0% display error by construction).
 */
export function ttSeasonLabel(season: number, seasonEnd: number, leagueId: number): string {
  // Cross-calendar → short two-year form "2020/21"; single-year tournament → "2020".
  const fmt = TT_SINGLE_YEAR_LEAGUE_IDS.includes(leagueId)
    ? (y: number) => `${y}`
    : (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
  return season === seasonEnd ? fmt(season) : `${fmt(season)}–${fmt(seasonEnd)}`;
}

// ---- timing (server-authoritative) -----------------------------------------

export const TT_TIMING = {
  /** Per-PLAYER turn timer in normal mode (brief §4.1). */
  turnSec: 30,
  /** Hint mode: countdown from 5→0 with inputs LOCKED (brief §4.3). */
  hintCountdownSec: 5,
  /** Hint mode: open answer window after a hint is shown. */
  hintAnswerSec: 30,
  /** Default round timer; customizable in CREATED rooms only (brief §5.2 case 3). */
  defaultRoundSec: 600,
  /** Reconnect grace before a dropped socket is treated as a withdrawal (reused
   *  from Link Up's value). */
  reconnectGraceMs: 5 * 60 * 1000,
  /** After a round ends, players ready up for a NEW round at the same table; when
   *  all connected humans are ready (bots auto-ready) or this grace elapses, a fresh
   *  round starts. Mirrors Link Up's NEW_ROUND_GRACE_SEC. */
  newRoundGraceSec: 15,
} as const;

export const TT_HINT = {
  /** Full rotations with zero correct guesses before switching to HINT (brief §4.2). */
  rotationsToTrigger: 2,
  /** Max hints per hidden card; after the 3rd with no correct answer it auto-reveals
   *  and nobody scores (brief §4.3). */
  maxHintsPerCard: 3,
  /** Per-PLAYER wrong attempts in hint mode; on exhaustion the input locks for the
   *  rest of the round (brief §4.3). */
  wrongAttemptsPerPlayer: 3,
} as const;

// ---- scoring & XP ----------------------------------------------------------

/** Points for revealing the card at a given rank = the rank itself (brief §3). */
export function ttPointsForRank(rank: number): number {
  return rank;
}

export const TT_XP = {
  /** Round XP multiplier by difficulty (brief §9). */
  difficultyMultiplier: { EASY: 1.0, MEDIUM: 1.5, HARD: 2.0 } as Record<TtDifficulty, number>,
  /** Bonus for revealing the valuable tail; cumulative if you reveal several. */
  tailBonus: { 8: 5, 9: 10, 10: 15 } as Record<number, number>,
  /** Match winner bonus. No separate runner-up bonus (approved): everyone keeps
   *  their per-round XP so all players still progress. */
  matchWinBonus: 50,
  /** Cosmetic level curve: XP to go from level L to L+1 = base + (L-1)*step. */
  levelBaseCost: 100,
  levelStep: 50,
} as const;

// ---- bot model (quick-play only) -------------------------------------------

export const TT_BOTS = {
  /** Skill band [min,max] per quick-play difficulty queue. */
  skillByDifficulty: {
    EASY: [0.3, 0.5],
    MEDIUM: [0.5, 0.7],
    HARD: [0.7, 0.9],
  } as Record<TtDifficulty, readonly [number, number]>,
  /** Per-turn correct probability = base + skill*slope. */
  correctProbBase: 0.4,
  correctProbSlope: 0.5,
  /** Normal-turn human-like think delay (seconds), scaled shorter for higher skill. */
  turnDelayMinSec: 2,
  turnDelayMaxSec: 8,
  /** Fastest-answer reaction (seconds): min + range*(1-skill) + jitter. */
  reactMinSec: 2.5,
  reactRangeSec: 6.5,
  reactJitterSec: 1,
  /** Quick-play tables are filled to a randomized seat count in this range
   *  (never below TT_MIN_PLAYERS, capped at TT_MAX_PLAYERS) — approved §6. */
  fillMinSeats: 2,
  fillMaxSeats: 4,
  /** Short window to gather more humans before filling with bots. */
  fillWindowSec: 8,
} as const;

// ---- completeness gate (catalog build) — tunable config --------------------

/** A (type, competition, season) is admitted to the catalog only if it passes ALL
 *  of these. Field-fill is a PROXY for "we have the true top 10"; the owner also
 *  reviews the generated catalog artifact (D5/D6). Thresholds live here so they can
 *  be tuned without code changes elsewhere. */
export const TT_GATE = {
  seasonMin: 2010,
  seasonMax: 2025,
  /** Minimum appearances for a player to count as a "regular" in a comp/season. */
  minAppearances: 5,
  /** Among the top-N regulars (by appearances), the stat must be present for at
   *  least this fraction — targets the players who could be in the top-10, not
   *  fringe nulls (the refinement from D6). */
  regularsTopN: 30,
  regularsFillMin: 0.95,
  /** At least this many players with a value > 0 (a clearly separable list). */
  minQualifiers: 20,
} as const;
