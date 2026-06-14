import type { BetRound } from "@fp/shared";

/**
 * Fold accounting (Section 10, decision 19.3). A folder loses ONLY the forfeit;
 * the rest of what they committed is refunded to their wallet immediately.
 *
 *   - FLOP (and PREFLOP, where the last mandatory bet is the ante): forfeit =
 *     half the ante.
 *   - TURN / RIVER: forfeit = half the player's last bet.
 *
 * The forfeit stays in the pot; refund = committedTotal − forfeit. All integer
 * (BigInt) math; halves floor (e.g. ante 50 → forfeit 25).
 */
export interface FoldAccounting {
  /** Stays in the pot; the player's only loss. */
  forfeit: bigint;
  /** Returned to the wallet immediately (REFUND). */
  refund: bigint;
}

export interface FoldParams {
  round: BetRound;
  ante: bigint;
  /** The player's last bet this hand (used for TURN/RIVER forfeits). */
  lastBetAmount: bigint;
  /** Everything the player has put into the pot this hand. */
  committedTotal: bigint;
}

export function computeFold(params: FoldParams): FoldAccounting {
  const { round, ante, lastBetAmount, committedTotal } = params;
  // PREFLOP/FLOP forfeits are anchored to the ante (the standing mandatory bet);
  // later rounds to the player's own last bet.
  const base = round === "PREFLOP" || round === "FLOP" ? ante : lastBetAmount;
  let forfeit = base / 2n;
  // Never forfeit more than what is actually in the pot.
  if (forfeit > committedTotal) forfeit = committedTotal;
  if (forfeit < 0n) forfeit = 0n;
  return { forfeit, refund: committedTotal - forfeit };
}
