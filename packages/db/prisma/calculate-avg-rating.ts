/**
 * Compute players.avg_rating = the average API-Football match rating across each
 * player's rated season/competition lines (player_season_stats.rating). Display/
 * data only — NEVER read by the rank engine. Idempotent: re-run after any season
 * import to refresh. Players with no rated line are left NULL.
 *
 *   pnpm --filter @fb/db exec tsx prisma/calculate-avg-rating.ts
 *
 * NOTE: the average is unweighted by sample size, so a player with very few rated
 * lines can score high on a fluke — guard rankings with a minimum line count.
 */
import "dotenv/config";
import { prisma } from "../src/client";

async function main() {
  const groups = await prisma.playerSeasonStat.groupBy({
    by: ["playerId"],
    where: { rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const entries = groups
    .filter((g) => g._avg.rating != null)
    .map((g) => ({ id: g.playerId, avg: Math.round(g._avg.rating! * 100) / 100, n: g._count.rating }));

  let done = 0;
  for (let i = 0; i < entries.length; i += 200) {
    const slice = entries.slice(i, i + 200);
    await Promise.all(slice.map((e) => prisma.player.update({ where: { id: e.id }, data: { avgRating: e.avg } })));
    done += slice.length;
  }
  const total = await prisma.player.count({ where: { avgRating: { not: null } } });
  console.log(`avg_rating written for ${done} players (total with avg_rating: ${total}).`);
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
