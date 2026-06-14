import type { Card, HandRankDef } from "@fp/engine";
import type { BetRound, GamePhase, GameConfig } from "@fp/shared";

/**
 * Authoritative in-memory room state (Section 8). The server is the only
 * referee — clients never hold sensitive state. Hole cards live here and on the
 * wire only to their owner.
 */

export type SeatStatus = "WAITING" | "ACTIVE" | "FOLDED" | "ALLIN" | "DISCONNECTED";

/** A football-player card: engine attributes + display/identity fields. */
export interface DealtCard extends Card {
  playerId: string;
  name: string;
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
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  phase: GamePhase;
  players: RoomPlayer[];
  /** 5 community cards, revealed progressively (FLOP 3, TURN 4, RIVER 5). */
  community: DealtCard[];
  communityRevealed: number;
  dealerSeat: number | null;
  currentTurnSeat: number | null;
  currentBet: bigint;
  turnDeadlineTs: number | null;
  /** HandRanks loaded from the DB (data-driven) — used for claim validation. */
  ranks: HandRankDef[];
}

/** Maps a betting round to its phase. */
export const ROUND_OF_PHASE: Partial<Record<GamePhase, BetRound>> = {
  PREFLOP: "PREFLOP",
  FLOP: "FLOP",
  TURN: "TURN",
  RIVER: "RIVER",
};
