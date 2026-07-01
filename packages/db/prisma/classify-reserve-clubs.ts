/**
 * Classifies reserve / "B" / second teams in football.clubs by setting
 * `clubs.is_reserve = true`.
 *
 *   pnpm db:classify-reserve-clubs            # write is_reserve for matching clubs
 *   pnpm db:classify-reserve-clubs --dry-run  # print what WOULD change, no writes
 *
 * WHY (Top Ten hint bug): the hint generator (apps/top-10-server/src/catalog.ts)
 * offers "أحد أنديته: <club>" from a player's career clubs. Reserve sides (Barcelona B,
 * Real Madrid Castilla, Bayern II, Jong Ajax, …) are stored as ordinary clubs, so they
 * leaked into hints. Hints must reference a player's FIRST team only. This flag is the
 * "proper data classification" (a curatable column) rather than a code-time name filter:
 * the heuristic seeds it, and a human can hand-correct false positives/negatives via
 * Prisma Studio or a follow-up UPDATE.
 *
 * SCOPE: additive & read ONLY by the Top Ten hint generator. It does NOT touch the Link
 * Up rank engine, fame scores, or career display — none of them read is_reserve.
 *
 * The match is deliberately CONSERVATIVE (only well-known reserve naming conventions) to
 * avoid demoting real senior clubs; review the printed list and adjust as needed.
 */
import { prisma } from "../src/client";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * True when a club NAME is a reserve/"B"/age side by well-established convention:
 *  - trailing " B" / " C" / " II" / " III"           (Barcelona B, Bayern München II)
 *  - "Castilla" / "Atlètic"/"Atletic" as a Barça/Madrid-style reserve suffix
 *  - Dutch "Jong " prefix                             (Jong Ajax, Jong PSV)
 *  - "Reserve(s)"                                     (… Reserves)
 *  - age teams "U18".."U23" / "Under-XX"              (Man United U21, …)
 * Case-insensitive; word-boundary anchored so "Bourg" / "Brescia" etc. never match.
 */
export function isReserveName(name: string): boolean {
  const n = name.trim();
  return (
    /\b(?:B|C|II|III)$/.test(n) ||          // trailing single-letter / roman reserve tag
    /\bcastilla\b/i.test(n) ||
    /\batl[eè]tic\b/i.test(n) ||             // "Barcelona Atlètic" (historical Barça B)
    /^jong\s/i.test(n) ||                    // Dutch reserves
    /\breserves?\b/i.test(n) ||
    /\bU(?:1[6-9]|2[0-3])\b/i.test(n) ||     // U16..U23
    /\bunder[-\s]?(?:1[6-9]|2[0-3])\b/i.test(n)
  );
}

async function main() {
  const clubs = await prisma.club.findMany({ select: { id: true, name: true, isReserve: true } });
  const toFlag = clubs.filter((c) => isReserveName(c.name) && !c.isReserve);
  const alreadyFlagged = clubs.filter((c) => c.isReserve);

  console.log(`clubs total          : ${clubs.length}`);
  console.log(`already is_reserve    : ${alreadyFlagged.length}`);
  console.log(`newly matched to flag : ${toFlag.length}`);
  for (const c of toFlag) console.log(`  + ${c.name}`);

  if (DRY_RUN) {
    console.log("DRY RUN — no database writes were performed.");
    return;
  }
  if (toFlag.length > 0) {
    await prisma.club.updateMany({
      where: { id: { in: toFlag.map((c) => c.id) } },
      data: { isReserve: true },
    });
  }
  console.log("✅ is_reserve written.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
