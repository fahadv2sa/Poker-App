import { z } from "zod";
import { BET_ACTIONS, GAME_PHASES, RESULT_OUTCOMES } from "./enums.js";

/**
 * WebSocket event contracts (Section 12). Client→server inputs are validated
 * with Zod (every input, Section 2.5); server→client payloads are typed.
 *
 * Coin amounts cross the wire as JS numbers (game balances are small, far
 * within Number.MAX_SAFE_INTEGER); the server converts to/from BigInt at the
 * boundary. Private hole cards NEVER appear in the broadcast `state:sync`.
 */

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

export const CLIENT_EVENTS = {
  roomJoin: "room:join",
  roomLeave: "room:leave",
  gameStart: "game:start",
  actionPlace: "action:place",
  claimSelect: "claim:select",
} as const;

export const SERVER_EVENTS = {
  stateSync: "state:sync",
  gameDealt: "game:dealt",
  phaseChanged: "phase:changed",
  turnChanged: "turn:changed",
  betPlaced: "bet:placed",
  playerFolded: "player:folded",
  showdownStart: "showdown:start",
  claimReceived: "claim:received",
  gameResult: "game:result",
  error: "error",
} as const;

// ---------------------------------------------------------------------------
// Client → server (validated)
// ---------------------------------------------------------------------------

export const roomJoinSchema = z.object({
  inviteCode: z.string().trim().min(1),
  password: z.string().optional(),
});
export type RoomJoinInput = z.infer<typeof roomJoinSchema>;

export const roomLeaveSchema = z.object({});
export type RoomLeaveInput = z.infer<typeof roomLeaveSchema>;

export const gameStartSchema = z.object({});
export type GameStartInput = z.infer<typeof gameStartSchema>;

export const actionPlaceSchema = z.object({
  type: z.enum(BET_ACTIONS).refine((t) => t !== "ANTE", "ANTE is server-posted"),
  /** Required for RAISE (raise-to total this round); ignored otherwise. */
  amount: z.number().int().nonnegative().optional(),
  /** Client-supplied idempotency key for this action. */
  actionId: z.string().min(1),
});
export type ActionPlaceInput = z.infer<typeof actionPlaceSchema>;

export const claimSelectSchema = z.object({
  handRankId: z.string().uuid(),
});
export type ClaimSelectInput = z.infer<typeof claimSelectSchema>;

// ---------------------------------------------------------------------------
// Server → client (typed views)
// ---------------------------------------------------------------------------

/** Public projection of a football-player card (no private data). */
export interface CardView {
  playerId: string;
  name: string;
  nationality: string;
  position: string;
  clubs: string[];
  photoUrl: string | null;
}

export interface PlayerView {
  seat: number;
  username: string;
  playerNumber: number;
  status: "WAITING" | "ACTIVE" | "FOLDED" | "ALLIN" | "DISCONNECTED";
  committedThisRound: number;
  committedTotal: number;
  isDealer: boolean;
}

/** Sanitized room snapshot sent to every client (never includes hole cards). */
export interface StateSyncPayload {
  gameId: string;
  roomName: string;
  phase: (typeof GAME_PHASES)[number];
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  players: PlayerView[];
  communityCards: (CardView | null)[];
  pot: number;
  currentBet: number;
  dealerSeat: number | null;
  currentTurnSeat: number | null;
  turnDeadlineTs: number | null;
  /** The recipient's own seat, or null if a spectator. */
  yourSeat: number | null;
}

export interface GameDealtPayload {
  holeCards: CardView[];
}

export interface PhaseChangedPayload {
  phase: (typeof GAME_PHASES)[number];
  communityCards: (CardView | null)[];
}

export interface TurnChangedPayload {
  seat: number;
  deadlineTs: number;
}

export interface BetPlacedPayload {
  seat: number;
  action: (typeof BET_ACTIONS)[number];
  amount: number;
  pot: number;
  currentBet: number;
}

export interface PlayerFoldedPayload {
  seat: number;
}

export interface HandRankOption {
  id: string;
  code: string;
  nameAr: string;
  strength: number;
}

export interface ShowdownStartPayload {
  availableHandRanks: HandRankOption[];
  deadlineTs: number;
}

export interface ClaimReceivedPayload {
  seat: number;
}

export interface GameResultEntry {
  seat: number;
  outcome: (typeof RESULT_OUTCOMES)[number];
  coinsDelta: number;
  finalBalance: number;
}

export interface GameResultPayload {
  results: GameResultEntry[];
  yourDelta: number;
  newBalance: number;
}

export interface ErrorPayload {
  code: string;
  messageAr: string;
}
