import type { Card, HandRankDef } from "@fp/engine";
import type { BetRound, Difficulty, GamePhase, GameConfig } from "@fp/shared";

/**
 * Authoritative in-memory room state (Section 8). The server is the only
 * referee — clients never hold sensitive state. Hole cards live here and on the
 * wire only to their owner.
 */

export type SeatStatus = "WAITING" | "ACTIVE" | "FOLDED" | "ALLIN" | "DISCONNECTED";

/**
 * A HandRank as the room holds it: the engine's evaluation fields plus the DB's
 * Arabic display name (`name_ar`). Carrying `nameAr` here keeps rank names
 * data-driven (Section 2.2) — the showdown payload reads it straight from the
 * DB-loaded value. It stays structurally assignable to the engine's pure
 * `HandRankDef` (the extra field is ignored by `validateClaim`).
 */
export interface RankInfo extends HandRankDef {
  nameAr: string;
}

/** A football-player card: engine attributes + display/identity fields. */
export interface DealtCard extends Card {
  playerId: string;
  name: string;
  /** Arabic display name (Batch 2). Display-only; null if not seeded. */
  nameAr?: string | null;
  /** Arabic name of this card's position (positions.name_ar), for result
   *  evidence — `position` itself is the engine token (GK/DEF/MID/FWD). */
  positionNameAr?: string | null;
  /** Fame score 0-100 (Part 4 card badge); null if not calculated. Display only. */
  fameScore?: number | null;
  photoUrl: string | null;
}

export interface RoomPlayer {
  seat: number;
  userId: string;
  username: string;
  playerNumber: number;
  status: SeatStatus;
  /** Wallet coins available to commit (snapshot, kept in sync with the ledger). */
  available: bigint;
  committedThisRound: bigint;
  committedTotal: bigint;
  lastBetAmount: bigint;
  hasActed: boolean;
  /** Forfeit left in the pot after folding (Section 10); 0 otherwise. */
  forfeit: bigint;
  /** Server-only; sent to the owner via game:dealt, never broadcast. */
  holeCards: DealtCard[];
  /** Showdown claim. */
  claimRankId: string | null;
  claimValid: boolean;
  claimStrength: number;
  connected: boolean;
}

export interface RoomState {
  gameId: string;
  roomName: string;
  inviteCode: string;
  createdBy: string;
  maxPlayers: number;
  isPrivate: boolean;
  config: GameConfig;
  /** Room difficulty — which fame tier the deal draws from (Part 3). Defaults to
   *  MEDIUM at the deal if unset (e.g. in tests). */
  difficulty?: Difficulty;
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  phase: GamePhase;
  players: RoomPlayer[];
  /** 5 community cards, revealed progressively (FLOP 3, TURN 4, RIVER 5). */
  community: DealtCard[];
  communityRevealed: number;
  /**
   * Hand counter within this room/session (feature #7). Increments each dealt
   * hand and salts every wallet `reference` that would otherwise repeat across
   * hands (ante/fold-refund/resolve), so idempotency stays correct hand-to-hand.
   */
  handNumber: number;
  dealerSeat: number | null;
  currentTurnSeat: number | null;
  currentBet: bigint;
  turnDeadlineTs: number | null;
  /** HandRanks loaded from the DB (data-driven) — claim validation + display name. */
  ranks: RankInfo[];
}

/** Maps a betting round to its phase. */
export const ROUND_OF_PHASE: Partial<Record<GamePhase, BetRound>> = {
  PREFLOP: "PREFLOP",
  FLOP: "FLOP",
  TURN: "TURN",
  RIVER: "RIVER",
};
