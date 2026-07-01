/**
 * Pure round state machine (brief §4). Simple, fixed 10-rank board.
 *
 * There are exactly 10 rank slots (1..10), each worth its rank in points (rank 10 is
 * worth the most; tail XP unchanged). A rank may have SEVERAL accepted players in the
 * catalog (a tie) — but the engine only tracks RANKS: revealing a rank clears it, and
 * the server's resolveOutcome maps any guessed playerId to its rank. So naming any one
 * tied player reveals that rank and every other tied player at it is automatically a
 * no-op ("already") — they are never needed. The round ends when all 10 ranks are
 * revealed. No cascade, no bonus, no shifting — ranks are fixed and never move.
 *
 * The game-server owns timers, sockets, DB, and the hint-target choice; this module
 * owns the LOGIC. Every function is pure: (state, event) → { state, events }.
 */
import { TT_HINT, TT_LIST_SIZE, ttPointsForRank, type TtRoundEndReason, type TtRoundMode } from "@fb/shared";

export interface RevealRecord {
  rank: number;
  bySeat: number | null; // null = auto-revealed (3-hint exhaustion), nobody scored
  points: number;
}

export interface HintState {
  targetRank: number;
  hintsGiven: number; // 0 during the initial countdown, 1..maxHints once shown
  /** Per-card cap = how many DISTINCT hints this target player actually has (≤
   *  TT_HINT.maxHintsPerCard). The card auto-reveals after the last real hint so a
   *  hint is never repeated to pad up to 3. */
  maxHints: number;
  phase: "COUNTDOWN" | "OPEN";
}

export interface RoundState {
  mode: TtRoundMode;
  seats: number[]; // active seat order
  turnIndex: number; // index into seats[] (NORMAL mode)
  turnsThisRotation: number; // turns taken since the current rotation began
  rotationHadCorrect: boolean; // any correct since the current rotation began
  noCorrectRotations: number;
  hidden: number[]; // hidden ranks, ascending
  reveals: RevealRecord[];
  hint: HintState | null;
  wrongAttempts: Record<number, number>; // seat -> wrong count (HINT, persists across cards)
  lockedSeats: number[]; // HINT: seats out of their 3 attempts
  done: boolean;
  endReason: TtRoundEndReason | null;
}

export type RoundEvent =
  | { t: "reveal"; rank: number; bySeat: number | null; points: number }
  | { t: "turnAdvanced"; toSeat: number }
  | { t: "rotationComplete"; noCorrectRotations: number }
  | { t: "modeSwitched"; mode: "HINT" }
  | { t: "seatLocked"; seat: number }
  | { t: "hintCountdownStarted"; targetRank: number }
  | { t: "hintRevealed"; targetRank: number; hintsGiven: number }
  | { t: "hintCardAutoRevealed"; rank: number }
  | { t: "roundEnded"; reason: TtRoundEndReason };

export type Outcome =
  | { type: "correct"; rank: number }
  | { type: "wrong" }
  | { type: "already" }; // picked an already-revealed (or cancelled tied) player — no penalty

interface Step {
  state: RoundState;
  events: RoundEvent[];
}

const ALL_RANKS = Array.from({ length: TT_LIST_SIZE }, (_, i) => i + 1);

export function initRound(seats: number[], startSeatIndex = 0): RoundState {
  return {
    mode: "NORMAL",
    seats: [...seats],
    turnIndex: startSeatIndex % Math.max(1, seats.length),
    turnsThisRotation: 0,
    rotationHadCorrect: false,
    noCorrectRotations: 0,
    hidden: [...ALL_RANKS],
    reveals: [],
    hint: null,
    wrongAttempts: {},
    lockedSeats: [],
    done: false,
    endReason: null,
  };
}

export function currentTurnSeat(s: RoundState): number | null {
  if (s.mode !== "NORMAL" || s.seats.length === 0) return null;
  return s.seats[s.turnIndex % s.seats.length] ?? null;
}

function clone(s: RoundState): RoundState {
  return {
    ...s,
    seats: [...s.seats],
    hidden: [...s.hidden],
    reveals: [...s.reveals],
    hint: s.hint ? { ...s.hint } : null,
    wrongAttempts: { ...s.wrongAttempts },
    lockedSeats: [...s.lockedSeats],
  };
}

function reveal(s: RoundState, rank: number, bySeat: number | null): RevealRecord {
  const points = bySeat == null ? 0 : ttPointsForRank(rank);
  const rec: RevealRecord = { rank, bySeat, points };
  s.reveals.push(rec);
  s.hidden = s.hidden.filter((r) => r !== rank);
  return rec;
}

/** Advance to the next seat in NORMAL mode, handling rotation accounting and the
 *  two-rotations-no-correct → HINT switch. Mutates `s`, pushes events. */
function advanceTurn(s: RoundState, events: RoundEvent[]): void {
  const n = s.seats.length;
  if (n === 0) return;
  s.turnIndex = (s.turnIndex + 1) % n;
  s.turnsThisRotation += 1;
  const wrapped = s.turnsThisRotation >= n; // every seat has had a turn this rotation
  if (wrapped) {
    s.turnsThisRotation = 0;
    if (s.rotationHadCorrect) {
      s.noCorrectRotations = 0;
    } else {
      s.noCorrectRotations += 1;
    }
    s.rotationHadCorrect = false;
    events.push({ t: "rotationComplete", noCorrectRotations: s.noCorrectRotations });
    if (s.noCorrectRotations >= TT_HINT.rotationsToTrigger) {
      s.mode = "HINT";
      events.push({ t: "modeSwitched", mode: "HINT" });
      return; // server now picks a hint target and starts the countdown
    }
  }
  const seat = currentTurnSeat(s);
  if (seat != null) events.push({ t: "turnAdvanced", toSeat: seat });
}

/** A guess in NORMAL mode. The server resolves the selected player into `outcome`. */
export function normalGuess(state: RoundState, seat: number, outcome: Outcome): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "NORMAL") return { state, events };
  if (currentTurnSeat(s) !== seat) return { state, events }; // not your turn — ignore

  if (outcome.type === "already") {
    // a revealed-or-cancelled tied player — no penalty, no turn pass
    return { state: s, events };
  }
  if (outcome.type === "correct") {
    const rec = reveal(s, outcome.rank, seat);
    events.push({ t: "reveal", rank: rec.rank, bySeat: seat, points: rec.points });
    s.rotationHadCorrect = true;
    s.noCorrectRotations = 0; // any correct resets the counter immediately (§4.2)
    if (s.hidden.length === 0) return endRound(s, "ALL_REVEALED");
    advanceTurn(s, events);
    return { state: s, events };
  }
  // wrong → lose the turn immediately
  advanceTurn(s, events);
  return { state: s, events };
}

/** The 30s turn timer expired with no correct guess → lose the turn. */
export function normalTimeout(state: RoundState, seat: number): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "NORMAL") return { state, events };
  if (currentTurnSeat(s) !== seat) return { state, events };
  advanceTurn(s, events);
  return { state: s, events };
}

// ---- HINT mode --------------------------------------------------------------

/** Begin a hidden card's cycle: start the 10→0 countdown (inputs locked). The
 *  server chose `targetRank` from the still-hidden ranks. */
export function beginHintCard(
  state: RoundState,
  targetRank: number,
  maxHints: number = TT_HINT.maxHintsPerCard,
): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT") return { state, events };
  // Clamp to [1, TT_HINT.maxHintsPerCard]: never more than 3 windows, and never fewer
  // than 1 (a target always has at least its nationality hint).
  const cap = Math.max(1, Math.min(TT_HINT.maxHintsPerCard, Math.floor(maxHints)));
  s.hint = { targetRank, hintsGiven: 0, maxHints: cap, phase: "COUNTDOWN" };
  events.push({ t: "hintCountdownStarted", targetRank });
  return { state: s, events };
}

/** Countdown reached 0 (or a previous answer window expired with hints left) → show a
 *  hint for the SAME card and open the answer window (TT_TIMING.hintAnswerSec). */
export function revealHint(state: RoundState): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT" || !s.hint) return { state, events };
  s.hint.hintsGiven += 1;
  s.hint.phase = "OPEN";
  events.push({ t: "hintRevealed", targetRank: s.hint.targetRank, hintsGiven: s.hint.hintsGiven });
  return { state: s, events };
}

/** A guess during an OPEN hint window (no turns — fastest answer). */
export function hintGuess(state: RoundState, seat: number, outcome: Outcome): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT" || !s.hint || s.hint.phase !== "OPEN") return { state, events };
  if (s.lockedSeats.includes(seat)) return { state, events }; // out of attempts

  if (outcome.type === "already") return { state: s, events }; // no penalty
  if (outcome.type === "correct") {
    const targetSolved = outcome.rank === s.hint.targetRank;
    const rec = reveal(s, outcome.rank, seat);
    events.push({ t: "reveal", rank: rec.rank, bySeat: seat, points: rec.points });
    if (s.hidden.length === 0) return endRound(s, "ALL_REVEALED");
    if (targetSolved) {
      // move on to the next card (server will pick a target & begin its countdown)
      s.hint = null;
    }
    // else: a DIFFERENT hidden card — hint stays on its original target; window continues
    return { state: s, events };
  }
  // wrong → consume one of the player's 3 attempts
  const used = (s.wrongAttempts[seat] ?? 0) + 1;
  s.wrongAttempts[seat] = used;
  if (used >= TT_HINT.wrongAttemptsPerPlayer && !s.lockedSeats.includes(seat)) {
    s.lockedSeats.push(seat);
    events.push({ t: "seatLocked", seat });
  }
  return { state: s, events };
}

/** The open answer window expired without the target being solved. Another hint for
 *  the same card if any remain, else auto-reveal the target (nobody scores). */
export function hintWindowTimeout(state: RoundState): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT" || !s.hint) return { state, events };
  if (s.hint.hintsGiven >= s.hint.maxHints) {
    const rank = s.hint.targetRank;
    const rec = reveal(s, rank, null); // auto-reveal, 0 points
    events.push({ t: "reveal", rank: rec.rank, bySeat: null, points: 0 });
    events.push({ t: "hintCardAutoRevealed", rank });
    s.hint = null;
    if (s.hidden.length === 0) return endRound(s, "ALL_REVEALED");
    return { state: s, events };
  }
  // give another hint for the same card → server reopens via revealHint()
  s.hint.phase = "COUNTDOWN";
  return { state: s, events };
}

// ---- round end + scoring ----------------------------------------------------

export function endRound(state: RoundState, reason: TtRoundEndReason): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done) return { state, events };
  s.done = true;
  s.endReason = reason;
  events.push({ t: "roundEnded", reason });
  return { state: s, events };
}

/** Points each seat earned this round (from the reveals). */
export function scoreBySeat(s: RoundState): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of s.reveals) {
    if (r.bySeat == null) continue;
    out[r.bySeat] = (out[r.bySeat] ?? 0) + r.points;
  }
  return out;
}

/** Ranks each seat personally revealed this round (for XP tail bonus + the
 *  match tiebreak). */
export function revealedRanksBySeat(s: RoundState): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const r of s.reveals) {
    if (r.bySeat == null) continue;
    (out[r.bySeat] ??= []).push(r.rank);
  }
  return out;
}
