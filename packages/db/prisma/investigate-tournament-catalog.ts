/**
 * READ-ONLY investigation: does the ACTIVE catalog contain national-team tournament
 * questions (WC/Euro/Copa, leagueId ∈ {1,4,9}) whose stat lines bundle QUALIFYING
 * with the finals (so the answer list is misleading)? No writes.
 *
 * Run against PROD:  DATABASE_URL=<prod> pnpm --filter @fb/db exec tsx prisma/investigate-tournament-catalog.ts
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { prisma, Prisma } from "../src/index";
import { TT_COMPETITIONS, TT_SINGLE_YEAR_LEAGUE_IDS } from "@fb/shared";

const compName = (id: number) =>
  TT_COMPETITIONS.find((c) => c.leagueId === id)?.nameAr ?? (id === 0 ? "Top-5 (grouped)" : `league ${id}`);

async function main() {
  console.log("DB:", (process.env.DATABASE_URL ?? "").replace(/:[^:@/]+@/, ":****@"), "\n");

  const entries = await prisma.ttCatalogEntry.findMany({
    where: { active: true },
    include: { players: { orderBy: { rank: "asc" } } },
  });
  console.log(`Active catalog entries: ${entries.length}`);

  const byLeague = new Map<number, number>();
  for (const e of entries) byLeague.set(e.leagueId, (byLeague.get(e.leagueId) ?? 0) + 1);
  console.log("\nBy competition (leagueId → count):");
  for (const [id, n] of [...byLeague.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${String(id).padStart(4)}  ${compName(id).padEnd(26)} ${n}`);
  }

  const affected = entries.filter((e) => TT_SINGLE_YEAR_LEAGUE_IDS.includes(e.leagueId));
  console.log(`\n*** Tournament entries (WC/Euro/Copa, leagueId ∈ {1,4,9}): ${affected.length} ***`);
  for (const e of affected.slice(0, 40)) {
    const win = e.seasonEnd && e.seasonEnd !== e.season ? `${e.season}-${e.seasonEnd}` : `${e.season}`;
    const top = e.players.slice(0, 3).map((p) => `r${p.rank}=${p.value}`).join(" ");
    console.log(`  [${e.difficulty}] ${e.type} · ${e.competitionName} · ${win} · top3 ${top}`);
  }
  if (affected.length > 40) console.log(`  … +${affected.length - 40} more`);

  console.log("\nFootball data shape for tournament leagues (maxApps > ~7 ⇒ qualifiers bundled in):");
  for (const id of TT_SINGLE_YEAR_LEAGUE_IDS) {
    const rows = await prisma.$queryRaw<
      Array<{ season: number; players: bigint; max_app: number | null; max_goals: number | null }>
    >(Prisma.sql`
      SELECT season, COUNT(DISTINCT player_id)::bigint AS players,
             MAX(games_appearances) AS max_app, MAX(goals_total) AS max_goals
      FROM football.player_season_stats
      WHERE league_id = ${id}
      GROUP BY season ORDER BY season`);
    console.log(`  ${compName(id)} (league ${id}):`);
    for (const r of rows) {
      console.log(`    ${r.season}: players=${Number(r.players)} maxApps=${r.max_app ?? "-"} maxGoals=${r.max_goals ?? "-"}`);
    }
    if (rows.length === 0) console.log("    (no rows)");
  }

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
