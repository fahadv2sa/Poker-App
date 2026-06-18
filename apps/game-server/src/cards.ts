import { Prisma, prisma } from "@fp/db";
import { DIFFICULTY_MAX_TIER, type Difficulty } from "@fp/shared";
import type { CardSource } from "./ports.js";
import type { DealtCard } from "./types.js";

/**
 * Random card dealing (Section 1: drawing is fully random within a session,
 * no permanent ownership). Data-driven: cards are real football players pulled
 * from the owner-supplied Players table — nothing is hardcoded. The draw is
 * scoped to the room's difficulty fame tier (Part 3).
 */
export class PrismaCardSource implements CardSource {
  async dealHand(
    seatCount: number,
    holePerSeat: number,
    difficulty: Difficulty = "ELITE",
  ): Promise<{ hole: DealtCard[][]; community: DealtCard[] }> {
    const need = seatCount * holePerSeat + 5;

    // Difficulty → tier ceiling. ELITE (null) draws from every active player;
    // the others restrict to the top tiers (untiered players only appear in ELITE).
    const maxTier = DIFFICULTY_MAX_TIER[difficulty];
    const tierFilter =
      maxTier === null ? Prisma.empty : Prisma.sql`AND tier IS NOT NULL AND tier <= ${maxTier}`;

    // Random, uniform draw of distinct eligible active players.
    const picked = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM players WHERE active = true ${tierFilter} ORDER BY random() LIMIT ${need}
    `);
    if (picked.length < need) {
      throw new Error(
        `Not enough eligible players to deal at difficulty ${difficulty} ` +
          `(${picked.length}/${need}). Lower the difficulty or seed more players.`,
      );
    }

    const rows = await prisma.player.findMany({
      where: { id: { in: picked.map((p) => p.id) } },
      include: {
        nationality: true,
        position: true,
        playerClubs: { include: { club: true } },
      },
    });
    // Preserve the random order from the raw query.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const deck: DealtCard[] = picked.map((p) => {
      const r = byId.get(p.id)!;
      return {
        playerId: r.id,
        name: r.name,
        nameAr: r.nameAr,
        nationality: r.nationality.name,
        position: r.position.code,
        positionNameAr: r.position.nameAr,
        fameScore: r.fameScore,
        clubs: r.playerClubs.map((pc) => pc.club.name),
        photoUrl: r.photoUrl,
      };
    });

    return dealFromDeck(deck, seatCount, holePerSeat);
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
