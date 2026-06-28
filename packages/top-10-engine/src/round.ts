/**
 * Pure round state machine (brief §4) with TIE CASCADE + BONUS cards.
 *
 * The board is a set of CARDS (one per answer player), each with a current `rank`
 * (= its points) that can change while it is hidden — the contestant never sees this
 * because hidden cards never expose their rank. Points are only realized AT REVEAL.
 *
 * Tie handling (owner-specified):
 *  - A tie at ANY rank means every tied player is a correct answer for that rank.
 *  - When the FIRST member of a tied group at rank N is revealed, the remaining tied
 *    members resolve one of two ways, decided right then:
 *      • CASCADE (no revealed card anywhere below rank N): the remaining members take
 *        ranks N+1, N+2, … (first-named gets the top of that band) and EVERY hidden
 *        card below shifts down by that many ranks (its points go up).
 *      • BONUS (any revealed card exists below rank N): cascade is fully blocked — the
 *        remaining members become BONUS ("+") cards at rank N (same points), no shift.
 *  - The round ends only when EVERY card (the 10 ranks + all bonus cards) is revealed.
 *
 * The game-server owns timers, sockets, DB, and hint-target choice; this module owns
 * the logic. Every function is pure: (state, …) → { state, events }.
 */
import { TT_HINT, ttPointsForRank, type TtRoundEndReason, type TtRoundMode } from "@fb/shared";

/** One card on the board (one answer player). */
export interface BoardCard {
  playerId: string;
  value: number;
  /** Current rank = points if revealed now. Shifts via cascade while hidden. */
  rank: number;
  revealed: boolean;
  /** True once split off as a bonus "+" card (cascade was blocked). */
  bonus: boolean;
}

export interface RevealRecord {
  playerId: string;
  rank: number;
  bySeat: number | null; // null = auto-revealed (hint exhaustion), nobody scored
  points: number;
  bonus: boolean;
}

export interface HintState {
  /** The specific hidden card being hinted (not a rank — ranks can collide on ties). */
  targetPlayerId: string;
  hintsGiven: number; // 0 during the initial countdown, 1..3 once shown
  phase: "COUNTDOWN" | "OPEN";
}

export interface RoundState {
  mode: TtRoundMode;
  seats: number[];
  turnIndex: number;
  turnsThisRotation: number;
  rotationHadCorrect: boolean;
  noCorrectRotations: number;
  /** The board, in STABLE display order (never reordered, so the UI never jumps). */
  cards: BoardCard[];
  reveals: RevealRecord[];
  hint: HintState | null;
  wrongAttempts: Record<number, number>;
  lockedSeats: number[];
  done: boolean;
  endReason: TtRoundEndReason | null;
}

export type RoundEvent =
  | { t: "reveal"; playerId: string; rank: number; bySeat: number | null; points: number; bonus: boolean }
  | { t: "turnAdvanced"; toSeat: number }
  | { t: "rotationComplete"; noCorrectRotations: number }
  | { t: "modeSwitched"; mode: "HINT" }
  | { t: "seatLocked"; seat: number }
  | { t: "hintCountdownStarted"; targetPlayerId: string }
  | { t: "hintRevealed"; targetPlayerId: string; hintsGiven: number }
  | { t: "hintCardAutoRevealed"; playerId: string; rank: number }
  | { t: "roundEnded"; reason: TtRoundEndReason };

export type Outcome = { type: "correct"; rank: number; bonus: boolean } | { type: "wrong" } | { type: "already" };

interface Step {
  state: RoundState;
  events: RoundEvent[];
}

/** Initialize from the catalog list (ranks 1..10, ties allowed at any rank). */
export function initRound(
  seats: number[],
  startSeatIndex: number,
  list: ReadonlyArray<{ playerId: string; value: number; rank: number }>,
): RoundState {
  return {
    mode: "NORMAL",
    seats: [...seats],
    turnIndex: startSeatIndex % Math.max(1, seats.length),
    turnsThisRotation: 0,
    rotationHadCorrect: false,
    noCorrectRotations: 0,
    cards: list.map((p) => ({ playerId: p.playerId, value: p.value, rank: p.rank, revealed: false, bonus: false })),
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

export function hiddenCount(s: RoundState): number {
  return s.cards.reduce((n, c) => n + (c.revealed ? 0 : 1), 0);
}

export function allRevealed(s: RoundState): boolean {
  return s.cards.every((c) => c.revealed);
}

/** The still-hidden card the server should hint next: the most valuable (highest
 *  rank). Returns its playerId, or null if none hidden. */
export function nextHintTarget(s: RoundState): string | null {
  let best: BoardCard | null = null;
  for (const c of s.cards) if (!c.revealed && (best == null || c.rank > best.rank)) best = c;
  return best?.playerId ?? null;
}

function clone(s: RoundState): RoundState {
  return {
    ...s,
    seats: [...s.seats],
    cards: s.cards.map((c) => ({ ...c })),
    reveals: [...s.reveals],
    hint: s.hint ? { ...s.hint } : null,
    wrongAttempts: { ...s.wrongAttempts },
    lockedSeats: [...s.lockedSeats],
  };
}

/**
 * Resolve + reveal a guessed player against the dynamic board. Mutates `s`. Returns
 * the Outcome; on "correct" it also pushes the RevealRecord. Applies the cascade /
 * bonus rules when the first member of a tied group is revealed.
 */
function applyReveal(s: RoundState, playerId: string, bySeat: number | null): Outcome {
  const card = s.cards.find((c) => c.playerId === playerId);
  if (!card) return { type: "wrong" }; // not in this list
  if (card.revealed) return { type: "already" }; // already revealed — no penalty

  const group = s.cards.filter((c) => c.value === card.value);
  const firstOfGroup = !group.some((c) => c.revealed);

  // A later member of a CASCADED band: it should resolve at the TOP (lowest rank)
  // still held by its hidden siblings, so the first-named gets the higher position.
  if (!firstOfGroup && !card.bonus) {
    const hiddenSibs = group.filter((c) => !c.revealed); // includes `card`
    const minRank = Math.min(...hiddenSibs.map((c) => c.rank));
    const holder = hiddenSibs.find((c) => c.rank === minRank)!;
    if (holder !== card) {
      holder.rank = card.rank;
      card.rank = minRank;
    }
  }

  card.revealed = true;
  const points = bySeat == null ? 0 : ttPointsForRank(card.rank);
  s.reveals.push({ playerId, rank: card.rank, bySeat, points, bonus: card.bonus });

  if (firstOfGroup) {
    const others = group.filter((c) => !c.revealed); // remaining tied members
    if (others.length > 0) {
      const n = card.rank;
      const revealedBelow = s.cards.some((c) => c.revealed && c.rank > n);
      if (revealedBelow) {
        // BONUS — any revealed card below blocks the whole group's cascade.
        for (const o of others) {
          o.bonus = true;
          o.rank = n;
        }
      } else {
        // CASCADE — shift every hidden card below down by m, band the others at
        // ranks n+1..n+m (all cards below n are hidden here, since none are revealed).
        const m = others.length;
        for (const c of s.cards) {
          if (c.revealed || group.includes(c)) continue;
          if (c.rank > n) c.rank += m;
        }
        others.forEach((o, i) => {
          o.rank = n + 1 + i;
        });
      }
    }
  }
  return { type: "correct", rank: card.rank, bonus: card.bonus };
}

/** Advance to the next seat in NORMAL mode + the two-rotations-no-correct → HINT. */
function advanceTurn(s: RoundState, events: RoundEvent[]): void {
  const n = s.seats.length;
  if (n === 0) return;
  s.turnIndex = (s.turnIndex + 1) % n;
  s.turnsThisRotation += 1;
  if (s.turnsThisRotation >= n) {
    s.turnsThisRotation = 0;
    if (s.rotationHadCorrect) s.noCorrectRotations = 0;
    else s.noCorrectRotations += 1;
    s.rotationHadCorrect = false;
    events.push({ t: "rotationComplete", noCorrectRotations: s.noCorrectRotations });
    if (s.noCorrectRotations >= TT_HINT.rotationsToTrigger) {
      s.mode = "HINT";
      events.push({ t: "modeSwitched", mode: "HINT" });
      return;
    }
  }
  const seat = currentTurnSeat(s);
  if (seat != null) events.push({ t: "turnAdvanced", toSeat: seat });
}

function pushReveal(s: RoundState, events: RoundEvent[]): void {
  const rec = s.reveals[s.reveals.length - 1]!;
  events.push({ t: "reveal", playerId: rec.playerId, rank: rec.rank, bySeat: rec.bySeat, points: rec.points, bonus: rec.bonus });
}

/** A guess in NORMAL mode (the server passes the selected playerId). */
export function normalGuess(state: RoundState, seat: number, playerId: string): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "NORMAL") return { state, events };
  if (currentTurnSeat(s) !== seat) return { state, events }; // not your turn

  const outcome = applyReveal(s, playerId, seat);
  if (outcome.type === "already") return { state: s, events }; // no penalty, keep guessing
  if (outcome.type === "correct") {
    pushReveal(s, events);
    s.rotationHadCorrect = true;
    s.noCorrectRotations = 0;
    if (allRevealed(s)) return endWith(s, events, "ALL_REVEALED");
    advanceTurn(s, events);
    return { state: s, events };
  }
  advanceTurn(s, events); // wrong → lose the turn
  return { state: s, events };
}

/** End the round while PRESERVING the events accumulated this step (so the final
 *  card's reveal still fires alongside roundEnded). */
function endWith(s: RoundState, events: RoundEvent[], reason: TtRoundEndReason): Step {
  const er = endRound(s, reason);
  return { state: er.state, events: [...events, ...er.events] };
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

/** Begin a hidden card's cycle: start the 10→0 countdown (inputs locked). */
export function beginHintCard(state: RoundState, targetPlayerId: string): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT") return { state, events };
  s.hint = { targetPlayerId, hintsGiven: 0, phase: "COUNTDOWN" };
  events.push({ t: "hintCountdownStarted", targetPlayerId });
  return { state: s, events };
}

/** Countdown reached 0 → show a hint for the SAME card and open the answer window. */
export function revealHint(state: RoundState): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT" || !s.hint) return { state, events };
  s.hint.hintsGiven += 1;
  s.hint.phase = "OPEN";
  events.push({ t: "hintRevealed", targetPlayerId: s.hint.targetPlayerId, hintsGiven: s.hint.hintsGiven });
  return { state: s, events };
}

/** A guess during an OPEN hint window (no turns — fastest answer). */
export function hintGuess(state: RoundState, seat: number, playerId: string): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT" || !s.hint || s.hint.phase !== "OPEN") return { state, events };
  if (s.lockedSeats.includes(seat)) return { state, events };

  const targetId = s.hint.targetPlayerId;
  const outcome = applyReveal(s, playerId, seat);
  if (outcome.type === "already") return { state: s, events };
  if (outcome.type === "correct") {
    pushReveal(s, events);
    if (allRevealed(s)) return endWith(s, events, "ALL_REVEALED");
    if (playerId === targetId) s.hint = null; // target solved → next card
    // else a DIFFERENT hidden card was named — hint stays on its target; window continues
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

/** The 30s open window expired without the target being solved. */
export function hintWindowTimeout(state: RoundState): Step {
  const s = clone(state);
  const events: RoundEvent[] = [];
  if (s.done || s.mode !== "HINT" || !s.hint) return { state, events };
  if (s.hint.hintsGiven >= TT_HINT.maxHintsPerCard) {
    const targetId = s.hint.targetPlayerId;
    applyReveal(s, targetId, null); // auto-reveal, 0 points
    const rec = s.reveals[s.reveals.length - 1]!;
    events.push({ t: "reveal", playerId: rec.playerId, rank: rec.rank, bySeat: null, points: 0, bonus: rec.bonus });
    events.push({ t: "hintCardAutoRevealed", playerId: targetId, rank: rec.rank });
    s.hint = null;
    if (allRevealed(s)) return endWith(s, events, "ALL_REVEALED");
    return { state: s, events };
  }
  s.hint.phase = "COUNTDOWN"; // another hint for the same card
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

/** Ranks each seat personally revealed this round (XP tail bonus + match tiebreak). */
export function revealedRanksBySeat(s: RoundState): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const r of s.reveals) {
    if (r.bySeat == null) continue;
    (out[r.bySeat] ??= []).push(r.rank);
  }
  return out;
}
