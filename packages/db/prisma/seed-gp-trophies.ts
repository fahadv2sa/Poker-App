import "dotenv/config";

import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

/**
 * Seeds the Guess the Player askable-trophy whitelist (gp_askable_trophies)
 * from football.trophy_dim — approved decision: curated, DATA-DRIVEN set.
 * All non-youth categories are seeded active; the owner curates by flipping
 * `active` rows (dashboard/SQL), never by code change. Idempotent upsert on
 * (comp_name, country); re-running never duplicates and never overrides a
 * manual `active` edit.
 *
 * sortOrder: prominent categories first in the composer's picker —
 *   UCL / top-5 league titles → 0, national-team trophies → 10,
 *   club cups → 20, other league titles → 30.
 */
const CATEGORY_SORT: Record<string, number> = {
  UCL: 0,
  LEAGUE_EN: 0,
  LEAGUE_ES: 0,
  LEAGUE_IT: 0,
  LEAGUE_DE: 0,
  LEAGUE_FR: 0,
  NATIONAL_SENIOR: 10,
  CLUB_CUP: 20,
  OTHER_LEAGUE: 30,
};

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { comp_name: string; country: string; category: string }[]
  >(Prisma.sql`
    SELECT comp_name, coalesce(country, '') AS country, category
    FROM football.trophy_dim
    WHERE category IN ('UCL','LEAGUE_EN','LEAGUE_ES','LEAGUE_IT','LEAGUE_DE','LEAGUE_FR',
                       'NATIONAL_SENIOR','CLUB_CUP','OTHER_LEAGUE')
  `);
  let created = 0;
  for (const r of rows) {
    const res = await prisma.gpAskableTrophy.upsert({
      where: { compName_country: { compName: r.comp_name, country: r.country } },
      // Never touch `active`/`nameAr` on re-run — owner curation survives.
      update: { category: r.category, sortOrder: CATEGORY_SORT[r.category] ?? 40 },
      create: {
        compName: r.comp_name,
        country: r.country,
        category: r.category,
        sortOrder: CATEGORY_SORT[r.category] ?? 40,
      },
    });
    if (res.seededAt.getTime() > Date.now() - 5_000) created++;
  }
  const total = await prisma.gpAskableTrophy.count();
  const active = await prisma.gpAskableTrophy.count({ where: { active: true } });
  console.log(`[gp-trophies] candidates=${rows.length} upserted (new≈${created})`);
  console.log(`[gp-trophies] table now: ${total} rows, ${active} active`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
