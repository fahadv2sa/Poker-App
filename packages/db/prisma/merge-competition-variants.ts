import "dotenv/config";

import { prisma } from "../src/client";

/**
 * CURATED competition-identity merges (zero-error, mirrors
 * merge-trophy-variants.ts): when the source data records the SAME real
 * competition under two league_ids (an API rename/re-key), add the pair here
 * — the variant id becomes unpickable and rides along as an engine
 * altLeagueId on every ask against the canonical.
 *
 * AS OF 2026-07-06 the list is EMPTY on purpose: a data sweep (same-name +
 * same-country, and name-containment + complementary season coverage) found
 * NO provable split — every candidate pair was a genuinely different
 * competition (Bundesliga vs 2. Bundesliga, Cup vs Super Cup…). The
 * mechanism ships so the class is covered the moment a real split appears;
 * the arabic-names audit surfaces the alias-table state on every run.
 */
const MERGES: ReadonlyArray<{ canonicalLeagueId: number; variantLeagueIds: number[] }> = [
  // { canonicalLeagueId: 123, variantLeagueIds: [456] },
];

async function main(): Promise<void> {
  let merged = 0;
  for (const m of MERGES) {
    for (const variant of m.variantLeagueIds) {
      await prisma.competitionAlias.upsert({
        where: { leagueId: variant },
        create: { leagueId: variant, canonicalLeagueId: m.canonicalLeagueId },
        update: { canonicalLeagueId: m.canonicalLeagueId },
      });
      merged++;
      console.log(`merged: league ${variant} → ${m.canonicalLeagueId}`);
    }
  }
  const total = await prisma.competitionAlias.count();
  console.log(`MERGED ${merged} variant id(s); alias table now ${total} row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
