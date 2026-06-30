/**
 * READ-ONLY verification: does our stored `season` integer mean the season that
 * STARTS that year (e.g. 2019 = 2019/20) or ENDS that year (2019 = 2018/19)?
 *
 * We compute the top scorers EXACTLY as the catalog does (SUM(goals_total) per
 * player for a league+season) for seasons with indisputable real-world golden boots,
 * and compare. No writes. Run: `pnpm --filter @fb/db exec tsx prisma/verify-season-mapping.ts`
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { prisma } from "../src/index";

async function topScorers(leagueId: number, season: number, take = 4) {
  const rows = await prisma.playerSeasonStat.groupBy({
    by: ["playerId"],
    where: { leagueId, season, goalsTotal: { not: null } },
    _sum: { goalsTotal: true },
    orderBy: { _sum: { goalsTotal: "desc" } },
    take,
  });
  const players = await prisma.player.findMany({
    where: { id: { in: rows.map((r) => r.playerId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  return rows.map((r) => `${nameById.get(r.playerId) ?? "?"} ${r._sum.goalsTotal ?? 0}`);
}

const CASES = [
  { label: "PL (39) season=2019", leagueId: 39, season: 2019, start: "Vardy 23 (2019/20)", end: "Aubameyang/Mané/Salah 22 (2018/19)" },
  { label: "PL (39) season=2017", leagueId: 39, season: 2017, start: "Salah 32 (2017/18)", end: "Kane 29 (2016/17)" },
  { label: "La Liga (140) season=2011", leagueId: 140, season: 2011, start: "Messi 50 (2011/12)", end: "Ronaldo 40 / Messi 31 (2010/11)" },
  { label: "World Cup (1) season=2018", leagueId: 1, season: 2018, start: "Kane 6 (WC 2018)", end: "(single-year tournament)" },
  { label: "World Cup (1) season=2022", leagueId: 1, season: 2022, start: "Mbappé 8 (WC 2022)", end: "(single-year tournament)" },
  { label: "Euro (4) season=2020", leagueId: 4, season: 2020, start: "C.Ronaldo/Schick 5 (Euro 2020, played 2021)", end: "(single-year tournament)" },
];

async function main() {
  console.log(`DB: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@/]+@/, ":****@")}\n`);
  for (const c of CASES) {
    const actual = await topScorers(c.leagueId, c.season);
    console.log(c.label);
    console.log(`  START-year would be → ${c.start}`);
    console.log(`  END-year would be   → ${c.end}`);
    console.log(`  ACTUAL top → ${actual.join(" | ") || "(no rows)"}\n`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
