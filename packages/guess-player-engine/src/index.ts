export type {
  GpAnswer,
  GpDifficulty,
  GpTrophyRef,
  GpQuestion,
  GpTemplate,
  GpClubSeason,
  GpCompetitionSeason,
  GpSeasonLine,
  GpTrophyWin,
  GpFactPack,
} from "./types.js";
export { GP_TEMPLATES } from "./types.js";
export { answerQuestion } from "./verify.js";
export { parseTrophySeason } from "./season.js";
export {
  canonicalCountry,
  comparableCountry,
  sameCountry,
  isYouthOrReserveTeamName,
  KNOWN_EXTRA_COUNTRIES,
  KNOWN_EXTRA_COUNTRIES_AR,
} from "./country.js";
export {
  GP_ROUND_SECONDS,
  GP_TURN_SECONDS,
  GP_GUESS_ATTEMPTS,
  GP_ROOM_MIN_PLAYERS,
  GP_ROOM_MAX_PLAYERS,
  GP_QUICK_PLAY_MAX_PLAYERS,
  GP_SURVIVAL_BONUS,
  GP_PICKER_SHARE,
  GP_DIFFICULTY_MULTIPLIER,
  GP_TIER_SCORE_RANGE,
  GP_VS_SYSTEM_MIN_SCORE,
  winnerPoints,
  pickerPoints,
} from "./scoring.js";
export {
  gpMatchWinBonus,
  gpXpThresholdForLevel,
  gpLevelForXp,
  gpLevelProgress,
} from "./xp.js";
