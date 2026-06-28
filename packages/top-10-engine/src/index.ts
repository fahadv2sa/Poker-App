/**
 * Top Ten engine — pure, I/O-free game logic for game #2 (توب 10). The game-server
 * and catalog builder feed it plain data and persist the results; this package
 * never touches the DB, sockets, or timers.
 */

export type { RankedPlayer, TopTenList, CandidateRow } from "./types.js";

export { compareArabic, compareForRank, buildRanking, buildAnswerList } from "./ranking.js";

export {
  validateRankedList,
  type ListPlayerMeta,
  type ValidateListInput,
} from "./validate.js";

export {
  evaluateGate,
  DEFAULT_GATE_CONFIG,
  type GateConfig,
  type GateResult,
} from "./gate.js";

export {
  percentile,
  computeThresholds,
  classifyDifficulty,
  type DifficultyThresholds,
} from "./difficulty.js";

export {
  tailBonus,
  roundXp,
  matchWinBonus,
  xpThresholdForLevel,
  levelForXp,
  levelProgress,
} from "./xp.js";

export {
  compareRevealedRanks,
  finalStandings,
  type StandingInput,
  type StandingRow,
} from "./standings.js";

export {
  type Rng,
  clamp01,
  correctProbability,
  pickWeightedRank,
  decideNormalTurn,
  decideHintAnswer,
  turnDelayMs,
  skillForDifficulty,
  type NormalTurnDecision,
  type HintAnswerDecision,
} from "./bot.js";

export {
  initRound,
  currentTurnSeat,
  hiddenCount,
  allRevealed,
  nextHintTarget,
  normalGuess,
  normalTimeout,
  beginHintCard,
  revealHint,
  hintGuess,
  hintWindowTimeout,
  endRound,
  scoreBySeat,
  revealedRanksBySeat,
  type BoardCard,
  type RoundState,
  type RoundEvent,
  type RevealRecord,
  type HintState,
  type Outcome,
} from "./round.js";
