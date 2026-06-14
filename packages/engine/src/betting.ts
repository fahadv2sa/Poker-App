import type { BetRound } from "@fp/shared";

/**
 * Betting-round mechanics (Sections 8, 9, 19.9). Pure: a reducer over the
 * round's betting state. The game-server owns wallets and timers and applies
 * the returned chip movement; this module only decides what is legal and how
 * the round progresses.
 *
 * Conventions:
 *   - `available` is the wallet coins a seat can still commit (no separate
 *     chip stack — players bet directly from their Coins balance).
 *   - `committedThisRound` resets each round; `currentBet` is the max of it.
 *   - A raise reopens the round: every other ACTIVE seat must act again.
 *   - First to act is the seat after the dealer (decision 19.9).
 *
 * Simplifications (documented): a short all-in that exceeds the current bet
 * reopens action like a full raise (incomplete-raise capping is not modeled),
 * and `lastBetAmount` tracks a seat's standing wager for the current round
 * (used by fold forfeits on TURN/RIVER).
 */

export type SeatStatus = "ACTIVE" | "FOLDED" | "ALLIN";

export interface BettingSeat {
  seat: number;
  status: SeatStatus;
  available: bigint;
  committedThisRound: bigint;
  committedTotal: bigint;
  lastBetAmount: bigint;
  /** Acted since the round opened or the last raise reopened it. */
  hasActed: boolean;
}

export interface BettingState {
  seats: BettingSeat[];
  dealerSeat: number;
  round: BetRound;
  currentBet: bigint;
  minRaise: bigint;
  currentTurnSeat: number | null;
}

export type ActionType = "CHECK" | "CALL" | "RAISE" | "FOLD" | "ALLIN";

export interface Action {
  type: ActionType;
  /** RAISE only: the target total committed this round (raise-to). */
  amount?: bigint;
}

/** The actual coins to debit from the wallet now, with its ledger action tag. */
export interface ChipMovement {
  seat: number;
  action: "CHECK" | "CALL" | "RAISE" | "FOLD" | "ALLIN";
  amount: bigint;
}

export interface ApplyResult {
  state: BettingState;
  movement: ChipMovement;
}

export interface LegalActions {
  canCheck: boolean;
  canCall: boolean;
  callAmount: bigint;
  canRaise: boolean;
  /** Minimum legal raise-to (total this round); null when raising is impossible. */
  minRaiseTo: bigint | null;
  /** Maximum raise-to given the stack (a full-stack raise = all-in). */
  maxRaiseTo: bigint;
  canFold: boolean;
  canAllIn: boolean;
  /** Total this round if the seat shoves all-in. */
  allInTo: bigint;
}

// ---------------------------------------------------------------------------
// Seat ordering helpers
// ---------------------------------------------------------------------------

function ordered(seats: readonly BettingSeat[]): BettingSeat[] {
  return [...seats].sort((a, b) => a.seat - b.seat);
}

/** Seats after `fromSeat` in ascending-seat order, wrapping around. */
function rotateFrom(seats: readonly BettingSeat[], fromSeat: number): BettingSeat[] {
  const order = ordered(seats);
  const idx = order.findIndex((s) => s.seat === fromSeat);
  if (idx === -1) return order;
  return [...order.slice(idx + 1), ...order.slice(0, idx + 1)];
}

function get(state: BettingState, seat: number): BettingSeat {
  const s = state.seats.find((x) => x.seat === seat);
  if (!s) throw new Error(`No such seat ${seat}`);
  return s;
}

function clone(state: BettingState): BettingState {
  return { ...state, seats: state.seats.map((s) => ({ ...s })) };
}

// ---------------------------------------------------------------------------
// Round status
// ---------------------------------------------------------------------------

const nonFolded = (state: BettingState) =>
  state.seats.filter((s) => s.status !== "FOLDED");

/** Only one (or zero) seat left un-folded — the hand ends without showdown. */
export function isHandOver(state: BettingState): boolean {
  return nonFolded(state).length <= 1;
}

function needsToAct(s: BettingSeat, currentBet: bigint): boolean {
  return s.status === "ACTIVE" && (!s.hasActed || s.committedThisRound < currentBet);
}

/** The next seat that still owes an action after `fromSeat`, or null. */
export function nextToAct(state: BettingState, fromSeat: number): number | null {
  for (const s of rotateFrom(state.seats, fromSeat)) {
    if (needsToAct(s, state.currentBet)) return s.seat;
  }
  return null;
}

/** Round is finished betting (everyone matched/all-in) but the hand continues. */
export function isRoundComplete(state: BettingState): boolean {
  if (isHandOver(state)) return false;
  return !state.seats.some((s) => needsToAct(s, state.currentBet));
}

// ---------------------------------------------------------------------------
// Opening a round
// ---------------------------------------------------------------------------

/**
 * First seat to act in a round: the next non-folded, non-all-in seat after the
 * dealer (decision 19.9).
 */
export function firstToAct(state: BettingState): number | null {
  for (const s of rotateFrom(state.seats, state.dealerSeat)) {
    if (s.status === "ACTIVE") return s.seat;
  }
  return null;
}

/**
 * Open a fresh betting round. Resets per-round commitments and `hasActed`, sets
 * the current bet to the max standing commitment (0 for FLOP/TURN/RIVER; the
 * ante for PREFLOP, where the server has pre-posted antes into
 * `committedThisRound`), and seats the first actor after the dealer.
 */
export function openRound(state: BettingState, round: BetRound): BettingState {
  const next = clone(state);
  next.round = round;
  let max = 0n;
  for (const s of next.seats) {
    s.hasActed = false;
    if (s.committedThisRound > max) max = s.committedThisRound;
  }
  next.currentBet = max;
  next.currentTurnSeat = firstToAct(next);
  return next;
}

/**
 * Reset round commitments to zero — used by the server between rounds AFTER it
 * has captured each seat's committedThisRound into committedTotal. Antes are
 * posted by the server before PREFLOP, so this is for FLOP/TURN/RIVER.
 */
export function clearRoundCommitments(state: BettingState): BettingState {
  const next = clone(state);
  for (const s of next.seats) s.committedThisRound = 0n;
  next.currentBet = 0n;
  return next;
}

// ---------------------------------------------------------------------------
// Legal actions + applying an action
// ---------------------------------------------------------------------------

export function legalActions(state: BettingState, seat: number): LegalActions {
  const s = get(state, seat);
  const owed = state.currentBet - s.committedThisRound;
  const minRaiseTotal = state.currentBet + state.minRaise;
  const minRaiseCost = minRaiseTotal - s.committedThisRound;
  const canCall = owed > 0n && s.available >= owed;
  const canRaise = s.status === "ACTIVE" && s.available >= minRaiseCost && s.available > owed;
  return {
    canCheck: owed === 0n && s.status === "ACTIVE",
    canCall,
    callAmount: owed,
    canRaise,
    minRaiseTo: canRaise ? minRaiseTotal : null,
    maxRaiseTo: s.committedThisRound + s.available,
    canFold: s.status === "ACTIVE",
    canAllIn: s.status === "ACTIVE" && s.available > 0n,
    allInTo: s.committedThisRound + s.available,
  };
}

/**
 * Apply an action for the seat whose turn it is. Returns the new state and the
 * chip movement to settle against the wallet. Throws on an illegal action — the
 * server is the referee, so callers must have validated turn/phase first.
 */
export function applyAction(state: BettingState, seat: number, action: Action): ApplyResult {
  if (state.currentTurnSeat !== seat) {
    throw new Error(`Not seat ${seat}'s turn`);
  }
  const next = clone(state);
  const s = get(next, seat);
  if (s.status !== "ACTIVE") throw new Error(`Seat ${seat} cannot act (${s.status})`);

  const owed = next.currentBet - s.committedThisRound;
  let movement: ChipMovement;

  switch (action.type) {
    case "CHECK": {
      if (owed !== 0n) throw new Error("Cannot check facing a bet");
      s.hasActed = true;
      movement = { seat, action: "CHECK", amount: 0n };
      break;
    }
    case "CALL": {
      if (owed <= 0n) throw new Error("Nothing to call");
      if (s.available < owed) throw new Error("Insufficient to call — use ALLIN");
      commit(s, owed);
      s.hasActed = true;
      movement = { seat, action: "CALL", amount: owed };
      break;
    }
    case "RAISE": {
      const raiseTo = action.amount;
      if (raiseTo === undefined) throw new Error("RAISE requires an amount (raise-to)");
      if (raiseTo < next.currentBet + next.minRaise) {
        throw new Error("Raise below minimum");
      }
      const cost = raiseTo - s.committedThisRound;
      if (cost > s.available) throw new Error("Raise exceeds available");
      commit(s, cost);
      next.currentBet = s.committedThisRound;
      reopen(next, seat);
      s.hasActed = true;
      movement = { seat, action: "RAISE", amount: cost };
      break;
    }
    case "ALLIN": {
      const cost = s.available;
      if (cost <= 0n) throw new Error("No coins to go all-in");
      commit(s, cost);
      s.status = "ALLIN";
      if (s.committedThisRound > next.currentBet) {
        next.currentBet = s.committedThisRound;
        reopen(next, seat);
      }
      s.hasActed = true;
      movement = { seat, action: "ALLIN", amount: cost };
      break;
    }
    case "FOLD": {
      s.status = "FOLDED";
      s.hasActed = true;
      movement = { seat, action: "FOLD", amount: 0n };
      break;
    }
    default: {
      const _exhaustive: never = action.type;
      throw new Error(`Unknown action ${_exhaustive}`);
    }
  }

  next.currentTurnSeat = isHandOver(next) ? null : nextToAct(next, seat);
  return { state: next, movement };
}

/** Move `amount` from a seat's available stack into the pot this round. */
function commit(s: BettingSeat, amount: bigint): void {
  s.available -= amount;
  s.committedThisRound += amount;
  s.committedTotal += amount;
  s.lastBetAmount = s.committedThisRound;
}

/** A raise reopens the round for every other ACTIVE seat. */
function reopen(state: BettingState, raiser: number): void {
  for (const s of state.seats) {
    if (s.seat !== raiser && s.status === "ACTIVE") s.hasActed = false;
  }
}
