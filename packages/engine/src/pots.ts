/**
 * Layered side pots (Section 9, decision 19.5). Built purely from each seat's
 * standing pot contribution at resolve time.
 *
 * Contribution model (Section 9.1 / 9.5):
 *   - Non-folders (ACTIVE/ALLIN) contribute their full unreturned `committed`.
 *     These drive the layering.
 *   - Folders contribute only their `forfeit` (the rest was already refunded at
 *     fold). All folder forfeits are dropped into the MAIN (lowest) pot.
 *   - Only non-folders are eligible to win a pot.
 */

export interface PotSeat {
  seat: number;
  /** Amount this seat still has in the pot (non-folder: committedTotal). */
  committed: bigint;
  /** True ⇒ contributes `forfeit` to the main pot and cannot win. */
  folded: boolean;
  /** Folder forfeit; ignored for non-folders. */
  forfeit: bigint;
}

export interface SidePot {
  /** Total coins in this pot (main pot includes folder forfeits). */
  amount: bigint;
  /** Per-eligible-seat contribution to this layer (refund unit if no winner). */
  perSeat: bigint;
  /** Non-folder seats that contributed this layer — the only winners eligible. */
  eligibleSeats: number[];
  /** Folder-forfeit coins folded into this pot (main pot only); a pure sink. */
  forfeit: bigint;
}

/**
 * Build the layered side pots, main pot first. Each ascending distinct
 * contribution level among non-folders opens a layer; every non-folder who
 * reached that level pays (level − prevLevel) into it. Folder forfeits are
 * appended to the main pot.
 */
export function buildSidePots(seats: readonly PotSeat[]): SidePot[] {
  const contributors = seats.filter((s) => !s.folded && s.committed > 0n);
  const forfeitTotal = seats
    .filter((s) => s.folded)
    .reduce((sum, s) => sum + (s.forfeit > 0n ? s.forfeit : 0n), 0n);

  const levels = [...new Set(contributors.map((s) => s.committed))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  const pots: SidePot[] = [];
  let prev = 0n;
  for (const level of levels) {
    const eligible = contributors.filter((s) => s.committed >= level);
    const perSeat = level - prev;
    pots.push({
      amount: perSeat * BigInt(eligible.length),
      perSeat,
      eligibleSeats: eligible.map((s) => s.seat),
      forfeit: 0n,
    });
    prev = level;
  }

  if (forfeitTotal > 0n) {
    if (pots.length === 0) {
      // Everyone folded (degenerate; last-standing handles real games). Park the
      // forfeit in a pot nobody is eligible for — it becomes a pure sink.
      pots.push({ amount: forfeitTotal, perSeat: 0n, eligibleSeats: [], forfeit: forfeitTotal });
    } else {
      pots[0]!.amount += forfeitTotal;
      pots[0]!.forfeit += forfeitTotal;
    }
  }

  return pots;
}

/** Total across all pots — handy for assertions and the display `pot` field. */
export function totalPot(pots: readonly SidePot[]): bigint {
  return pots.reduce((sum, p) => sum + p.amount, 0n);
}
