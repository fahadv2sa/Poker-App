import { Prisma, prisma } from "@fp/db";
import { DIFFICULTY_MIN_SCORE, type Difficulty } from "@fp/shared";
import type { CardSource } from "./ports.js";
import type { DealtCard } from "./types.js";

/**
 * Card dealing with a SINGLE-DECK, no-repeat rule per table (feature: shuffled
 * deck). When a table starts, the full eligible player pool for its difficulty
 * is shuffled into one deck. Every card dealt — hole AND community — is consumed
 * from that deck; nothing repeats until the whole tier deck is exhausted, then
 * it reshuffles and repetition is allowed again. Data-driven: the pool is read
 * from the owner-supplied Players table (nothing hardcoded).
 */

/**
 * A pure, in-memory shuffled deck for ONE table. No I/O — fully unit-testable.
 * Holds the tier's eligible player ids and a cursor; draws distinct ids round
 * after round, reshuffling the full pool only once it is exhausted.
 */
export class TableDeck {
  private readonly ids: string[];
  private pos = 0;

  constructor(
    pool: readonly string[],
    private readonly rng: () => number = Math.random,
  ) {
    if (pool.length === 0) throw new Error("TableDeck: empty player pool");
    this.ids = [...pool];
    this.shuffle();
  }

  get size(): number {
    return this.ids.length;
  }

  /** Fisher–Yates in place; resets the cursor to the top of the fresh shuffle. */
  private shuffle(): void {
    for (let i = this.ids.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = this.ids[i]!;
      this.ids[i] = this.ids[j]!;
      this.ids[j] = tmp;
    }
    this.pos = 0;
  }

  /**
   * Draw `need` DISTINCT ids for one round, consuming them from the deck. No id
   * repeats across rounds until the deck is exhausted; then the full pool
   * reshuffles and dealing continues. Within a single round every id is distinct
   * even across a reshuffle boundary (TOP-UP behaviour): the leftover tail is
   * dealt, the pool reshuffles, and the remainder is drawn from the new shuffle
   * while skipping any id already used this round (so no card appears twice in
   * the same hand, and a skipped id is consumed so it can't reappear next round
   * either). Throws if a round needs more cards than the pool holds.
   */
  draw(need: number): string[] {
    if (need > this.ids.length) {
      throw new Error(
        `TableDeck: a round needs ${need} cards but the pool holds only ${this.ids.length}`,
      );
    }
    const round: string[] = [];
    const seen = new Set<string>();
    while (round.length < need) {
      if (this.pos >= this.ids.length) this.shuffle(); // deck exhausted → reshuffle
      const id = this.ids[this.pos++]!;
      if (!seen.has(id)) {
        seen.add(id);
        round.push(id);
      }
      // else: a duplicate from the fresh shuffle (only possible right after a
      // mid-round reshuffle) — consumed (pos advanced) so it won't reappear next
      // round, but not dealt twice in this one.
    }
    return round;
  }
}

export class PrismaCardSource implements CardSource {
  /** One shuffled deck per live table (keyed by gameId). Cleared on room close. */
  private readonly decks = new Map<string, { difficulty: Difficulty; deck: TableDeck }>();

  async dealHand(
    tableId: string,
    seatCount: number,
    holePerSeat: number,
    difficulty: Difficulty = "ELITE",
  ): Promise<{ hole: DealtCard[][]; community: DealtCard[] }> {
    const need = seatCount * holePerSeat + 5;
    const deck = await this.deckFor(tableId, difficulty, need);

    // Consume `need` distinct players from the table's deck (no repeats until the
    // whole tier deck is exhausted, then it reshuffles).
    const pickedIds = deck.draw(need);

    const rows = await prisma.player.findMany({
      where: { id: { in: pickedIds } },
      include: {
        nationality: true,
        position: true,
        playerClubs: { include: { club: true } },
      },
    });
    // Preserve the deck order from draw().
    const byId = new Map(rows.map((r) => [r.id, r]));
    const dealt: DealtCard[] = pickedIds.map((id) => {
      const r = byId.get(id)!;
      return {
        playerId: r.id,
        name: r.name,
        nameAr: r.nameAr,
        nationality: r.nationality.name,
        position: r.position.code,
        positionNameAr: r.position.nameAr,
        // Effective card score: legends show their legend-track score, everyone
        // else their base fame_score (legendScore is null for non-legends).
        fameScore: r.legendScore ?? r.fameScore,
        clubs: r.playerClubs.map((pc) => pc.club.name),
        photoUrl: r.photoUrl,
      };
    });

    return dealFromDeck(dealt, seatCount, holePerSeat);
  }

  /** Drop a table's deck when the room closes (frees memory; a new table at the
   *  same difficulty starts from a fresh full shuffle). */
  releaseTable(tableId: string): void {
    this.decks.delete(tableId);
  }

  /**
   * Get (or build) the table's deck. Built once per table from the full eligible
   * pool for the difficulty: ELITE = every active player; the others restrict to
   * floor(fame_score) >= the tier floor (decimals never shift a boundary). If the
   * stored deck's difficulty differs (shouldn't change mid-table) it is rebuilt.
   */
  private async deckFor(
    tableId: string,
    difficulty: Difficulty,
    need: number,
  ): Promise<TableDeck> {
    const existing = this.decks.get(tableId);
    if (existing && existing.difficulty === difficulty) return existing.deck;

    const minScore = DIFFICULTY_MIN_SCORE[difficulty];
    const scoreFilter =
      minScore <= 0 ? Prisma.empty : Prisma.sql`AND floor(fame_score) >= ${minScore}`;
    const eligible = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM players WHERE active = true ${scoreFilter}
    `);
    if (eligible.length < need) {
      throw new Error(
        `Not enough eligible players to deal at difficulty ${difficulty} ` +
          `(${eligible.length}/${need}). Lower the difficulty or seed more players.`,
      );
    }

    const deck = new TableDeck(eligible.map((e) => e.id));
    this.decks.set(tableId, { difficulty, deck });
    return deck;
  }
}

/** Slice an already-ordered deck into per-seat hole cards + 5 community cards. */
export function dealFromDeck(
  deck: DealtCard[],
  seatCount: number,
  holePerSeat: number,
): { hole: DealtCard[][]; community: DealtCard[] } {
  const hole: DealtCard[][] = [];
  let i = 0;
  for (let s = 0; s < seatCount; s++) {
    hole.push(deck.slice(i, i + holePerSeat));
    i += holePerSeat;
  }
  const community = deck.slice(i, i + 5);
  return { hole, community };
}
