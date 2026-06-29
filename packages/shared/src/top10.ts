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

/** The types the catalog will actually generate today (GK_CLEAN_SHEETS excluded
 *  until a clean-sheets column exists; club/national-team types deferred — D3). */
export const TT_ACTIVE_QUESTION_TYPES: readonly TtQuestionType[] = [
  "GOAL_SCORERS",
  "ASSISTS",
  "KEY_PASSES",
  "KEY_PASSES_ALL",
  "TACKLES",
  "ACCURATE_PASSES",
  "ACCURATE_PASSES_ALL",
  "SHOTS_TOTAL",
  "SHOTS_ON",
  "DRIBBLES_SUCCESS",
  "GK_SAVES",
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

// ---- structural constants --------------------------------------------------

export const TT_LIST_SIZE = 10;
export const TT_MIN_PLAYERS = 2;
export const TT_MAX_PLAYERS = 4;
export const TT_ROUNDS_PER_MATCH = 3; // fixed (brief §5.1)

// ---- timing (server-authoritative) -----------------------------------------

export const TT_TIMING = {
  /** Per-PLAYER turn timer in normal mode (brief §4.1). */
  turnSec: 30,
  /** Hint mode: countdown from 10→0 with inputs LOCKED (brief §4.3). */
  hintCountdownSec: 10,
  /** Hint mode: open answer window after a hint is shown. */
  hintAnswerSec: 30,
  /** Default round timer; customizable in CREATED rooms only (brief §5.2 case 3). */
  defaultRoundSec: 600,
  /** Reconnect grace before a dropped socket is treated as a withdrawal (reused
   *  from Link Up's value). */
  reconnectGraceMs: 5 * 60 * 1000,
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
