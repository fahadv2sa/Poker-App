import { buildSidePots, type PotSeat, type SidePot } from "./pots.js";

/**
 * Showdown resolution (Sections 9.4 & 11). Pure: given each seat's standing pot
 * contribution and whether it made a valid claim (with the claimed strength),
 * it builds the side pots and returns the exact wallet movements to apply.
 *
 * Distribution per pot: the highest claimed strength among the pot's eligible
 * (non-folded, valid) seats wins it; ties split (SPLIT_WIN), remainder coins go
 * to the lowest seats. A pot with no eligible valid winner pays no one — its
 * non-folder layer contributions are REFUNDed to their contributors, and any
 * folder forfeit parked in it becomes a FOLD_FORFEIT sink (see
 * forfeit-accounting model). Last-player-standing is just the case where the
 * sole non-folder is the only eligible seat in every pot.
 */

/** Resolve-time wallet movement. `amount` is signed (credit + / sink −). */
export interface Settlement {
  seat: number;
  type: "WIN" | "SPLIT_WIN" | "REFUND" | "FOLD_FORFEIT";
  amount: bigint;
}

export interface ResolveSeat extends PotSeat {
  /** Non-folder reached showdown with a valid claim (or is last-standing). */
  claimedValid: boolean;
  /** Strength of the validly claimed rank; ignored when claimedValid is false. */
  strength: number;
}

export interface ResolveResult {
  pots: SidePot[];
  settlements: Settlement[];
}

function splitAmount(amount: bigint, winners: number[]): Map<number, bigint> {
  const sorted = [...winners].sort((a, b) => a - b);
  const n = BigInt(sorted.length);
  const base = amount / n;
  let remainder = amount - base * n; // 0 .. n-1, handed out 1 coin at a time
  const out = new Map<number, bigint>();
  for (const seat of sorted) {
    let share = base;
    if (remainder > 0n) {
      share += 1n;
      remainder -= 1n;
    }
    out.set(seat, share);
  }
  return out;
}

export function resolveShowdown(seats: readonly ResolveSeat[]): ResolveResult {
  const pots = buildSidePots(seats);
  const bySeat = new Map(seats.map((s) => [s.seat, s]));
  const settlements: Settlement[] = [];

  for (const pot of pots) {
    const eligibleValid = pot.eligibleSeats.filter((seat) => {
      const s = bySeat.get(seat);
      return s?.claimedValid === true;
    });

    if (eligibleValid.length > 0) {
      // Highest claimed strength among eligible takes the pot; ties split.
      let top = -Infinity;
      for (const seat of eligibleValid) {
        const strength = bySeat.get(seat)!.strength;
        if (strength > top) top = strength;
      }
      const winners = eligibleValid.filter((seat) => bySeat.get(seat)!.strength === top);
      const type = winners.length > 1 ? "SPLIT_WIN" : "WIN";
      for (const [seat, share] of splitAmount(pot.amount, winners)) {
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
