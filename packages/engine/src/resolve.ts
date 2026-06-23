import { buildSidePots, type PotSeat, type SidePot } from "./pots.js";

/**
 * Showdown resolution (Sections 9.4 & 11). Pure: given each seat's standing pot
 * contribution, its combination strength, and the sum of the player (fame)
 * scores in that combination, it builds the side pots and returns the exact
 * wallet movements to apply.
 *
 * Distribution per pot (winner-determination method):
 *   1) the strongest combination (highest rank strength) among the pot's
 *      eligible (non-folded, valid) seats qualifies;
 *   2) ties on strength are broken by the STRONGER sum of player scores in the
 *      combination — the higher `scoreSum` wins outright;
 *   3) still tied on strength AND score ⇒ split equally (SPLIT_WIN), and the
 *      indivisible remainder goes to the round starter (`dealerSeat`) when they
 *      are among the tied winners, else to the lowest-seat winner.
 * A pot with no eligible valid winner pays no one — its non-folder layer
 * contributions are REFUNDed, and any folder forfeit parked in it becomes a
 * FOLD_FORFEIT sink. Last-player-standing is the case where the sole non-folder
 * is the only eligible seat in every pot.
 */

/** Resolve-time wallet movement. `amount` is signed (credit + / sink −). */
export interface Settlement {
  seat: number;
  type: "WIN" | "SPLIT_WIN" | "REFUND" | "FOLD_FORFEIT";
  amount: bigint;
}

export interface ResolveSeat extends PotSeat {
  /** Non-folder reached showdown with a valid combination (or is last-standing). */
  claimedValid: boolean;
  /** Strength of the combination; ignored when claimedValid is false. */
  strength: number;
  /** Sum of the player (fame) scores of the cards forming this seat's
   *  combination — the tiebreaker among equal-strength seats (higher wins).
   *  Defaults to 0 (so equal-strength seats with no score data still split). */
  scoreSum?: number;
}

export interface ResolveResult {
  pots: SidePot[];
  settlements: Settlement[];
}

function splitAmount(
  amount: bigint,
  winners: number[],
  remainderSeat?: number,
): Map<number, bigint> {
  const sorted = [...winners].sort((a, b) => a - b);
  const n = BigInt(sorted.length);
  const base = amount / n;
  // Indivisible remainder (0 .. n-1) goes to the round starter (`remainderSeat`,
  // the dealer) when they are among the tied winners, else to the FIRST
  // (lowest-seat) winner. base * n + remainder === amount, so the pot is always
  // fully distributed with no coins created or lost.
  const remainder = amount - base * n;
  const recipient =
    remainderSeat !== undefined && sorted.includes(remainderSeat) ? remainderSeat : sorted[0];
  const out = new Map<number, bigint>();
  for (const seat of sorted) {
    out.set(seat, seat === recipient ? base + remainder : base);
  }
  return out;
}

export function resolveShowdown(
  seats: readonly ResolveSeat[],
  dealerSeat?: number,
): ResolveResult {
  const pots = buildSidePots(seats);
  const bySeat = new Map(seats.map((s) => [s.seat, s]));
  const settlements: Settlement[] = [];

  for (const pot of pots) {
    const eligibleValid = pot.eligibleSeats.filter((seat) => {
      const s = bySeat.get(seat);
      return s?.claimedValid === true;
    });

    if (eligibleValid.length > 0) {
      // 1) Strongest combination (highest rank strength) qualifies.
      let topStrength = -Infinity;
      for (const seat of eligibleValid) {
        const strength = bySeat.get(seat)!.strength;
        if (strength > topStrength) topStrength = strength;
      }
      const atTopStrength = eligibleValid.filter(
        (seat) => bySeat.get(seat)!.strength === topStrength,
      );
      // 2) Tiebreak by the stronger sum of player scores in the combination.
      let topScore = -Infinity;
      for (const seat of atTopStrength) {
        const score = bySeat.get(seat)!.scoreSum ?? 0;
        if (score > topScore) topScore = score;
      }
      const winners = atTopStrength.filter(
        (seat) => (bySeat.get(seat)!.scoreSum ?? 0) === topScore,
      );
      // 3) Still tied on strength AND score ⇒ split; remainder to the round starter.
      const type = winners.length > 1 ? "SPLIT_WIN" : "WIN";
      for (const [seat, share] of splitAmount(pot.amount, winners, dealerSeat)) {
        if (share > 0n) settlements.push({ seat, type, amount: share });
      }
    } else {
      // No eligible valid winner: refund non-folder layer contributions ...
      for (const seat of pot.eligibleSeats) {
        if (pot.perSeat > 0n) settlements.push({ seat, type: "REFUND", amount: pot.perSeat });
      }
      // ... and turn any parked folder forfeit into an explicit sink. Each
      // folder is refunded its forfeit and then forfeits it (net zero, but it
      // surfaces the FOLD_FORFEIT row that makes Σ deltas = −Σ|forfeit| hold).
      if (pot.forfeit > 0n) {
        for (const s of seats) {
          if (s.folded && s.forfeit > 0n) {
            settlements.push({ seat: s.seat, type: "REFUND", amount: s.forfeit });
            settlements.push({ seat: s.seat, type: "FOLD_FORFEIT", amount: -s.forfeit });
          }
        }
      }
    }
  }

  return { pots, settlements };
}

/** Net resolve-time credit per seat (sum of signed settlement amounts). */
export function netBySeat(settlements: readonly Settlement[]): Map<number, bigint> {
  const out = new Map<number, bigint>();
  for (const m of settlements) out.set(m.seat, (out.get(m.seat) ?? 0n) + m.amount);
  return out;
}
