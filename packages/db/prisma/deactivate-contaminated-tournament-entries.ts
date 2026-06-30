/**
 * Surgically deactivate ACTIVE catalog entries on a national-team tournament season
 * whose data bundles QUALIFYING (a finals run is ≤ TT_TOURNAMENT_FINALS_MAX_APPS
 * matches). Uses the SAME contamination definition as the build guard, so it removes
 * exactly what a fresh build would now exclude — no full rebuild required.
 *
 *   DATABASE_URL=<prod> pnpm --filter @fb/db exec tsx prisma/deactivate-contaminated-tournament-entries.ts            # preview only
 *   DATABASE_URL=<prod> pnpm --filter @fb/db exec tsx prisma/deactivate-contaminated-tournament-entries.ts --apply    # write
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { prisma, Prisma } from "../src/index";
import { TT_SINGLE_YEAR_LEAGUE_IDS, TT_TOURNAMENT_FINALS_MAX_APPS } from "@fb/shared";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`DB: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@/]+@/, ":****@")} ${APPLY ? "[APPLY]" : "[preview]"}\n`);

  const contaminated = new Set<string>();
  const rows = await prisma.$queryRaw<Array<{ league_id: number; season: number; max_app: number | null }>>(Prisma.sql`
    SELECT league_id, season, MAX(games_appearances) AS max_app
    FROM football.player_season_stats
    WHERE league_id IN (${Prisma.join([...TT_SINGLE_YEAR_LEAGUE_IDS])})
    GROUP BY league_id, season`);
  for (const r of rows) {
    if ((r.max_app ?? 0) > TT_TOURNAMENT_FINALS_MAX_APPS) contaminated.add(`${r.league_id}:${r.season}`);
  }
  console.log(`Contaminated tournament seasons (maxApps > ${TT_TOURNAMENT_FINALS_MAX_APPS}): ${[...contaminated].sort().join(", ") || "(none)"}`);

  const active = await prisma.ttCatalogEntry.findMany({
    where: { active: true, leagueId: { in: [...TT_SINGLE_YEAR_LEAGUE_IDS] } },
    select: { id: true, type: true, leagueId: true, competitionName: true, season: true, seasonEnd: true, difficulty: true },
  });
  const targets = active.filter((e) => {
    const end = e.seasonEnd ?? e.season;
    for (let y = e.season; y <= end; y++) if (contaminated.has(`${e.leagueId}:${y}`)) return true;
    return false;
  });

  const totalActive = await prisma.ttCatalogEntry.count({ where: { active: true } });
  console.log(`\nActive entries total: ${totalActive}`);
  console.log(`To deactivate: ${targets.length}`);
  for (const e of targets) {
    const win = e.seasonEnd && e.seasonEnd !== e.season ? `${e.season}-${e.seasonEnd}` : `${e.season}`;
    console.log(`  [${e.difficulty}] ${e.type} · ${e.competitionName} · ${win}`);
  }

  if (!APPLY) {
    console.log("\n(preview only — re-run with --apply to write)");
    await prisma.$disconnect();
    return;
  }
  if (targets.length === 0) {
    console.log("\nNothing to deactivate.");
    await prisma.$disconnect();
    return;
  }

  const res = await prisma.ttCatalogEntry.updateMany({
    where: { id: { in: targets.map((t) => t.id) }, active: true },
    data: { active: false },
  });
  const nowActive = await prisma.ttCatalogEntry.count({ where: { active: true } });
  console.log(`\nDeactivated ${res.count} entries. Active now: ${nowActive} (was ${totalActive}).`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
