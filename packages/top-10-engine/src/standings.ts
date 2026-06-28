/**
 * Final match standings + the high-rank-first (poker-style) tiebreak (brief §10).
 * Winner = highest total points. Tie on points → whoever discovered the MORE
 * VALUABLE players: compare the highest rank each revealed (10th), then 9th, etc.
 * Still identical → a true tie. Pure.
 */

export interface StandingInput {
  userId: string;
  points: number;
  /** Every rank this player personally revealed across the whole match (1..10). */
  revealedRanks: number[];
}

export interface StandingRow extends StandingInput {
  place: number; // 1 = winner; equal places share a number on a true tie
  tiedWithPrev: boolean;
}

/**
 * Tiebreak comparator over two players' revealed-rank multisets. Returns <0 if `a`
 * ranks ABOVE `b` (a is "better"), >0 if below, 0 if identical. Compares the
 * highest revealed rank first (descending), then the next, poker-high-card style.
 * A player who revealed a higher card wins; if one runs out of cards first, the one
 * with more revealed cards wins the comparison at that depth.
 */
export function compareRevealedRanks(a: readonly number[], b: readonly number[]): number {
  const as = [...a].sort((x, y) => y - x);
  const bs = [...b].sort((x, y) => y - x);
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const av = as[i] ?? -1; // ran out of cards → worse than any real rank
    const bv = bs[i] ?? -1;
    if (av !== bv) return bv - av; // higher card first
  }
  return 0;
}

/**
 * Full standings: sort by points desc, then by the revealed-rank tiebreak. Players
 * who are completely identical (same points AND identical revealed ranks) share a
 * place and are flagged `tiedWithPrev` — a declared tie.
 */
export function finalStandings(players: readonly StandingInput[]): StandingRow[] {
  const sorted = [...players].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    return compareRevealedRanks(a.revealedRanks, b.revealedRanks);
  });

  const rows: StandingRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1]! : null;
    const tied =
      prev != null &&
      prev.points === cur.points &&
      compareRevealedRanks(prev.revealedRanks, cur.revealedRanks) === 0;
    rows.push({
      ...cur,
      place: tied ? rows[i - 1]!.place : i + 1,
      tiedWithPrev: tied,
    });
  }
  return rows;
}
