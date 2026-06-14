/**
 * Canonical enums shared across the monorepo. These mirror the Prisma enums
 * (packages/db/prisma/schema.prisma) and the spec (Sections 5, 7, 8).
 * Keep this file as the single source of truth for string literal unions used
 * in Zod contracts and game logic.
 */

export const WALLET_TX_TYPES = [
  "SIGNUP_BONUS",
  "BANK_CLAIM",
  "ANTE",
  "BET",
  "RAISE",
  "ALLIN",
  "WIN",
  "SPLIT_WIN",
  "REFUND",
  "FOLD_FORFEIT",
] as const;
export type WalletTxType = (typeof WALLET_TX_TYPES)[number];

export const POSITION_CODES = ["GK", "DEF", "MID", "FWD"] as const;
export type PositionCode = (typeof POSITION_CODES)[number];

export const HAND_RANK_CODES = [
  "ROYAL_CLUB",
  "ROYAL_NATION",
  "ROYAL_POSITION",
  "FULL_HOUSE",
  "FULL_HOUSE_CLUB",
  "LINEUP",
  "TRIPLE",
  "TWO_PAIR",
  "PAIR",
] as const;
export type HandRankCode = (typeof HAND_RANK_CODES)[number];

export const GAME_STATUSES = ["LOBBY", "IN_PROGRESS", "ENDED", "ABANDONED"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const GAME_PHASES = [
  "LOBBY",
  "PREFLOP",
  "FLOP",
  "TURN",
  "RIVER",
  "SHOWDOWN",
  "RESOLVE",
  "ENDED",
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const GAME_PLAYER_STATUSES = [
  "WAITING",
  "ACTIVE",
  "FOLDED",
  "ALLIN",
  "DISCONNECTED",
] as const;
export type GamePlayerStatus = (typeof GAME_PLAYER_STATUSES)[number];

export const CARD_TYPES = ["HOLE", "COMMUNITY"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const BET_ROUNDS = ["PREFLOP", "FLOP", "TURN", "RIVER"] as const;
export type BetRound = (typeof BET_ROUNDS)[number];

export const BET_ACTIONS = ["ANTE", "CHECK", "CALL", "RAISE", "FOLD", "ALLIN"] as const;
export type BetAction = (typeof BET_ACTIONS)[number];

export const RESULT_OUTCOMES = ["WIN", "SPLIT", "LOSE", "FOLD", "REFUND"] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];
