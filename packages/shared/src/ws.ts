import { z } from "zod";
import { BET_ACTIONS, DIFFICULTIES, GAME_PHASES, RESULT_OUTCOMES } from "./enums.js";

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
  /** Host closes the table: void any live hand (refund bets), evict everyone,
   *  delete the room (server verifies the requester is the creator). */
  roomClose: "room:close",
  gameStart: "game:start",
  /** Host explicitly deals the next hand of the session (Batch 1: no auto-deal). */
  nextHand: "hand:next",
  /** Winner screen: this player pressed "New Round" (ready for the next hand). The
   *  server starts once all connected humans are ready, or when the grace elapses. */
  roundReady: "round:ready",
  actionPlace: "action:place",
  /** Quick Play: join a tier's matchmaking queue. */
  queueJoin: "queue:join",
  /** Quick Play: leave the queue while waiting (no charge, clean state). */
  queueLeave: "queue:leave",
} as const;

export const SERVER_EVENTS = {
  stateSync: "state:sync",
  gameDealt: "game:dealt",
  phaseChanged: "phase:changed",
  turnChanged: "turn:changed",
  betPlaced: "bet:placed",
  playerFolded: "player:folded",
  gameResult: "game:result",
  /** PRIVATE per-seat: the recipient's own strongest achievable rank, revealed on
   *  the winner screen only (winner-announcement reveal, never mid-hand). */
  bestRank: "result:best",
  /** A new hand began in the same room (feature #7: multi-hand session). */
  handStarted: "hand:started",
  /** Winner screen ready-check status: who's ready + the auto-advance deadline. */
  roundStatus: "round:status",
  /** The session can't deal a hand yet (fewer than 2 players can afford the ante). */
  sessionWaiting: "session:waiting",
  /** A player disconnected / left the room (Batch 2: opponent-left banner). */
  playerLeft: "player:left",
  /** The room was closed (host closed it, or it auto-deleted when it emptied).
   *  Clients should leave the table and return to the menu. */
  roomClosed: "room:closed",
  /** Quick Play: the queue's waiting-lobby state (count + countdown). */
  queueState: "queue:state",
  /** Quick Play: matched into an auto-created table — go play. */
  queueMatched: "queue:matched",
  error: "error",
} as const;

// ---------------------------------------------------------------------------
// Client → server (validated)
// ---------------------------------------------------------------------------

export const roomJoinSchema = z.object({
  inviteCode: z.string().trim().min(1),
});
export type RoomJoinInput = z.infer<typeof roomJoinSchema>;

export const roomLeaveSchema = z.object({});
export type RoomLeaveInput = z.infer<typeof roomLeaveSchema>;

export const gameStartSchema = z.object({});
export type GameStartInput = z.infer<typeof gameStartSchema>;

export const roomCloseSchema = z.object({});
export type RoomCloseInput = z.infer<typeof roomCloseSchema>;

export const actionPlaceSchema = z.object({
  type: z.enum(BET_ACTIONS).refine((t) => t !== "ANTE", "ANTE is server-posted"),
  /** Required for RAISE (raise-to total this round); ignored otherwise. */
  amount: z.number().int().nonnegative().optional(),
  // No client-supplied idempotency key: the wallet reference is generated
  // SERVER-side from authoritative state (gameId + seat + server action seq),
  // so the client can never influence a financial reference (Section 6.3).
});
export type ActionPlaceInput = z.infer<typeof actionPlaceSchema>;

export const roundReadySchema = z.object({});
export type RoundReadyInput = z.infer<typeof roundReadySchema>;

export const queueJoinSchema = z.object({
  difficulty: z.enum(DIFFICULTIES),
});
export type QueueJoinInput = z.infer<typeof queueJoinSchema>;

// ---------------------------------------------------------------------------
// Server → client (typed views)
// ---------------------------------------------------------------------------

/** Public projection of a football-player card. The football attributes
 *  (nationality/position/clubs) remain in the payload — they're public for
 *  community cards and the official showdown reveal, and drive nothing on the
 *  client beyond optional display; the card UI shows only the name(s). */
export interface CardView {
  playerId: string;
  name: string;
  /** Arabic display name (Batch 2, data-driven from the DB); null if unseeded. */
  nameAr: string | null;
  nationality: string;
  position: string;
  clubs: string[];
  photoUrl: string | null;
  /** Fame score 0-100 (Part 4 badge), or null if not yet calculated. Display
   *  only — never used by rank logic. */
  fameScore: number | null;
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

/** A single (main or side) pot for display when an all-in splits the pot (A4). */
export interface PotView {
  amount: number;
  /** Non-folded seats eligible to win this layer. */
  eligibleSeats: number[];
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
  /** Layered pots for display (length 1 = single pot; >1 only with all-ins). */
  pots: PotView[];
  currentBet: number;
  dealerSeat: number | null;
  currentTurnSeat: number | null;
  turnDeadlineTs: number | null;
  /** The recipient's own seat, or null if a spectator. */
  yourSeat: number | null;
  /** Seat of the current host (table authority). Starts as the creator's seat and
   *  transfers to another seated player if the creator exits without closing.
   *  null when no connected host remains (the room is closing). */
  hostSeat: number | null;
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
  /** Coins THIS seat would forfeit (its only loss) by folding right now — half
   *  the ante on PREFLOP/FLOP, half its last bet on TURN/RIVER, capped at what it
   *  has committed. The rest of its commitment is refunded on fold. Shown in the
   *  fold confirmation so the player knows exactly how much they'd lose. */
  foldForfeit: number;
}

export interface BetPlacedPayload {
  seat: number;
  action: (typeof BET_ACTIONS)[number];
  amount: number;
  pot: number;
  /** Layered pots for display (length 1 = single pot; >1 only with all-ins). */
  pots: PotView[];
  currentBet: number;
}

export interface PlayerFoldedPayload {
  seat: number;
}

/**
 * One leaf of the WHY behind a claimed association, built server-side from the
 * engine's witness + DB data (Section 2.2 data-driven; no football data or
 * explanations hardcoded in the client). Renders as e.g.
 * "ميسي ودي ماريا (نفس الجنسية: الأرجنتين)".
 */
export interface ClaimEvidenceGroup {
  /** Which attribute these cards share. */
  attribute: "nationality" | "position" | "club";
  /** Ready Arabic connective label for the attribute — fixed game vocabulary,
   *  not football data (e.g. "نفس الجنسية", "نفس المركز", "نادي مشترك"). */
  attributeLabelAr: string;
  /** The shared value as the DB stores it: position → Arabic name (positions
   *  table); nationality/club → their DB name. Never hardcoded in the client. */
  value: string;
  /** club "identical" only: the full shared club set (else omitted). */
  values?: string[];
  /** The football-player cards forming this group — display names only. */
  players: { nameAr: string | null; nameEn: string }[];
}

export interface GameResultEntry {
  seat: number;
  outcome: (typeof RESULT_OUTCOMES)[number];
  coinsDelta: number;
  finalBalance: number;
  /** Structured evidence (from the engine's witness) for WHY this seat's valid
   *  claim was achieved — the cards involved + the shared attribute/value, all
   *  data-driven. null for folders, invalid claims, or last-standing endings. */
  claimEvidence: ClaimEvidenceGroup[] | null;
  /** Whether this seat's showdown claim was valid; `null` for folders / no claim
   *  context. Lets the client explain an invalid-claim loss (Batch 1, item 6). */
  claimValid: boolean | null;
  /** The association this seat claimed at showdown (Arabic, from the DB), or null
   *  if they folded / never chose. Shown in the result so players see each pick. */
  claimedRankNameAr: string | null;
  /** Official reveal (SPEC §2.4): a remaining contender's hole cards become
   *  visible to everyone ONLY at showdown resolution. `null` for folders (never
   *  revealed) and for non-showdown (last-player-standing) endings. */
  holeCards: CardView[] | null;
  /** The cards that FORM this seat's shown combination (engine witness): each
   *  player's strongest achievable rank — a subset of the revealed pool, so the
   *  winner screen shows only these, never all 7. `[]` if no rank qualifies;
   *  `null` only when not revealed. Computed by the engine evaluator. */
  combinationCards: CardView[] | null;
  /** Sum of the player (fame) scores of the cards in `combinationCards` — the
   *  tiebreaker shown per player on the winner screen (winner and loser). 0 when
   *  no combination qualifies; `null` when this seat isn't revealed. */
  scoreSum: number | null;
  /** Combination (hand) strength 1-9 used to ORDER the celebrated winners
   *  (strongest first). 0 when no rank qualifies; `null` when not revealed. */
  strength: number | null;
  /** Total coins this seat put into the pot this hand (the "paid" side of the
   *  money math shown on expand). 0 for a never-dealt seat. */
  contributed: number;
  /** The pots this seat WON and the gross amount taken from each, in pot order
   *  (potIndex 0 = main pot, shown as ⛁ 1). Empty when this seat won nothing.
   *  Drives the per-winner pot icons and the expanded settlement breakdown. */
  potsWon: { potIndex: number; amount: number }[];
}

export interface GameResultPayload {
  results: GameResultEntry[];
  yourDelta: number;
  newBalance: number;
  /** The winning association (Arabic, from the DB), or null for a non-showdown
   *  (last-player-standing) ending. */
  winningRankNameAr: string | null;
}

/**
 * PRIVATE per-seat winner-screen reveal: the recipient's OWN strongest achievable
 * rank from their final cards (computed by the same engine evaluator as the
 * winner logic — display only, never changes the outcome). `rankNameAr` is null
 * when no rank qualifies (shown as "no rank"). `cards` are exactly the cards that
 * formed the rank; `evidence` is the data-driven WHY. Sent only to the owner, so
 * a folder sees their own without exposing their cards to anyone else.
 */
export interface BestRankPayload {
  rankNameAr: string | null;
  evidence: ClaimEvidenceGroup[] | null;
  cards: CardView[];
}

/**
 * A fresh hand started in the same room (feature #7). Carries the rotated dealer
 * and the reset, sanitized player projection so clients can clear the previous
 * hand's board/result and redraw. Hole cards still arrive privately via game:dealt.
 */
export interface HandStartedPayload {
  handNumber: number;
  dealerSeat: number | null;
  players: PlayerView[];
  pot: number;
  currentBet: number;
}

/**
 * Winner-screen ready-check status. `readySeats` are the seats that pressed "New
 * Round"; `totalHumans` is how many connected humans must be ready (bots are
 * auto-ready and excluded); `deadlineTs` (epoch ms) is when the round
 * auto-advances regardless. The next hand starts at all-ready OR the deadline.
 */
export interface RoundStatusPayload {
  readySeats: number[];
  totalHumans: number;
  deadlineTs: number | null;
}

/** The session is open but idle. `NEED_PLAYERS` = not enough players can afford
 *  the next ante; `NOT_READY` = the winner-screen grace elapsed with NOBODY
 *  pressing "New Round", so the table parked instead of auto-charging antes
 *  (money safety — an AFK table must never drain wallets). */
export interface SessionWaitingPayload {
  reason: "NEED_PLAYERS" | "NOT_READY";
  eligible: number;
}

/** A player disconnected / left the room (Batch 2). */
export interface PlayerLeftPayload {
  seat: number;
  username: string;
}

/** The room was closed and removed — or this seat's session there ended.
 *  `CLOSED_BY_HOST` = the creator closed it; `EMPTY` = it auto-deleted when the
 *  last player left; `SEAT_RELEASED` = sent only to a stale socket whose user
 *  deliberately entered ANOTHER table (one table at a time — the old seat was
 *  released via the normal leave path). */
export interface RoomClosedPayload {
  reason: "CLOSED_BY_HOST" | "EMPTY" | "SEAT_RELEASED";
}

/** Quick Play waiting-lobby state for one tier's queue. `deadlineTs` (epoch ms)
 *  is set once the fill window is armed (≥ min queued) so the client can count
 *  down locally; null while still gathering below the minimum. */
export interface QueueStatePayload {
  difficulty: (typeof DIFFICULTIES)[number];
  count: number;
  min: number;
  max: number;
  deadlineTs: number | null;
}

/** Quick Play match found — the auto-created table to join. */
export interface QueueMatchedPayload {
  gameId: string;
  inviteCode: string;
}

export interface ErrorPayload {
  code: string;
  messageAr: string;
}
