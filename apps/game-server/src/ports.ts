import type { Settlement } from "@fp/engine";
import type { BetRound } from "@fp/shared";
import type { DealtCard, RoomPlayer, RoomState } from "./types.js";

/**
 * Ports the GameRoom orchestrator depends on. Real implementations do I/O
 * (PostgreSQL, Socket.IO, timers); test fakes record calls. Keeping the room
 * logic behind these interfaces makes the full hand flow testable without a
 * database or sockets.
 */

/** Supplies random football-player cards for a hand (data-driven, from the DB). */
export interface CardSource {
  /**
   * Deal `holeCount` hole cards per seat plus 5 community cards, all distinct.
   * Throws if the player database has too few active players.
   */
  dealHand(seatCount: number, holePerSeat: number): Promise<{
    hole: DealtCard[][];
    community: DealtCard[];
  }>;
}

/** A single wallet movement the room asks the ledger to apply atomically. */
export interface LedgerMovement {
  userId: string;
  type:
    | "ANTE"
    | "BET"
    | "RAISE"
    | "ALLIN"
    | "WIN"
    | "SPLIT_WIN"
    | "REFUND"
    | "FOLD_FORFEIT";
  /** Signed: negative debits (bets), positive credits (wins/refunds). */
  amount: bigint;
  /** Server-generated idempotency key (the reference). */
  reference: string;
}

export interface BetRecord {
  seat: number;
  round: BetRound;
  action: "ANTE" | "CHECK" | "CALL" | "RAISE" | "FOLD" | "ALLIN";
  amount: bigint;
}

/**
 * Persistence port. Each method runs in ONE DB transaction: wallet movements
 * (via the Phase-1 wallet service, with row locks + idempotency) plus the
 * associated game-record writes, committed together or rolled back together.
 */
export interface RoomPersistence {
  /**
   * Current wallet balances for the given users (the authoritative source for a
   * seat's spendable `available`). Used when seating and at hand start so the
   * in-memory betting balance always mirrors the ledger — never a guessed value.
   */
  getBalances(userIds: string[]): Promise<Map<string, bigint>>;
  /** Persist the game row + seats at start; deal records written here too. */
  persistDeal(state: RoomState): Promise<void>;
  /** Apply wallet movements + append Bet rows atomically. */
  applyBetting(
    gameId: string,
    movements: LedgerMovement[],
    bets: BetRecord[],
  ): Promise<void>;
  /** Record a player's claim (validated by the engine). */
  persistClaim(
    gameId: string,
    player: RoomPlayer,
    claimedRankId: string | null,
    isValid: boolean,
    bestPossibleRankId: string | null,
  ): Promise<void>;
  /**
   * Final settlement: apply WIN/SPLIT_WIN/REFUND/FOLD_FORFEIT movements, write
   * GameResults, and update UserStats — all in one transaction.
   */
  persistResolve(
    gameId: string,
    settlements: Settlement[],
    players: RoomPlayer[],
  ): Promise<void>;
}

/** Broadcasts server→client events (Section 12). */
export interface Emitter {
  toRoom(event: string, payload: unknown): void;
  toSeat(seat: number, event: string, payload: unknown): void;
}

/** Schedules the per-turn / per-claim deadline callbacks (60s, Section 9). */
export interface TimerService {
  /** Arm a timer; returns a handle. Re-arming the same key clears the prior. */
  arm(key: string, ms: number, cb: () => void): void;
  clear(key: string): void;
  clearAll(): void;
}

/** Source of wall-clock time (injectable for deterministic tests). */
export interface Clock {
  now(): number;
}
