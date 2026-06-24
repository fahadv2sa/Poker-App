import type { Settlement } from "@fb/engine";
import type { BetRound, Difficulty, PlayEventType } from "@fb/shared";
import type { DealtCard, RoomPlayer, RoomState } from "./types.js";

/** One Layer-1 stats event (append-only). Written off the betting hot path. */
export interface PlayEventRecord {
  playerId: string;
  gameId?: string | null;
  handNumber: number;
  type: PlayEventType;
  value?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Ports the GameRoom orchestrator depends on. Real implementations do I/O
 * (PostgreSQL, Socket.IO, timers); test fakes record calls. Keeping the room
 * logic behind these interfaces makes the full hand flow testable without a
 * database or sockets.
 */

/** Supplies football-player cards for a hand (data-driven, from the DB). */
export interface CardSource {
  /**
   * Deal `holePerSeat` hole cards per seat plus 5 community cards, all distinct.
   * `difficulty` restricts the draw to the matching fame tier (Part 3). Dealing
   * is single-deck per table (`tableId`): every card dealt is consumed and does
   * not repeat until the whole tier deck is exhausted, then it reshuffles.
   * Throws if the player database has too few eligible players for one round.
   */
  dealHand(
    tableId: string,
    seatCount: number,
    holePerSeat: number,
    difficulty?: Difficulty,
  ): Promise<{
    hole: DealtCard[][];
    community: DealtCard[];
  }>;
  /** Drop a table's deck when its room closes (frees memory; the next table at
   *  that difficulty starts from a fresh full shuffle). */
  releaseTable(tableId: string): void;
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
   * GameResults, and update UserStats — all in one transaction. `handNumber`
   * salts the settlement idempotency keys so successive hands in the same room
   * (feature #7) never collide on a reference.
   */
  persistResolve(
    gameId: string,
    settlements: Settlement[],
    players: RoomPlayer[],
    handNumber: number,
  ): Promise<void>;
  /**
   * Close a room for good: refund any coins still committed to a live hand
   * (REFUND movements, returning each contributor's stake) and mark the game
   * ABANDONED — atomically, in one transaction. `refunds` is empty when closing
   * from the lobby or between hands (nothing is in the pot). The salted
   * `reference` on each refund keeps it idempotent if a close is ever retried.
   */
  closeGame(
    gameId: string,
    refunds: LedgerMovement[],
    handNumber: number,
  ): Promise<void>;
  /** Stats Layer 1: append a batch of raw play events (append-only). */
  recordPlayEvents(events: PlayEventRecord[]): Promise<void>;
  /** Stats Layers 2-4: incrementally aggregate metrics/badges/XP for the given
   *  players. Runs AFTER a hand, off the betting hot path. */
  aggregatePlayers(userIds: string[]): Promise<void>;
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
