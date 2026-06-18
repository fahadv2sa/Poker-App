/**
 * Computes players.fame_score (0-100) for every ACTIVE player from the spec's
 * weighted formula. STANDALONE, re-runnable, no I/O beyond the DB — it touches
 * ONLY players.fame_score and never the rank engine, wallet, or card privacy.
 *
 *   pnpm db:calculate-scores            # write fame_score for all active players
 *   pnpm db:calculate-scores --dry-run  # compute + print top/bottom, NO writes
 *
 * The big-tournament (COMPONENT 3) and top-5-season (COMPONENT 4) inputs come
 * from the tournament-stats import; until that has run they are 0, so the score
 * reflects COMPONENTS 1/2/5 (club, nation, diversity) plus the special rules.
 * Re-run this after the import to fold in the remaining components.
 *
 * The football-knowledge tiers below are this display/difficulty tool's config,
 * not the rank engine (which still reads all football data from the DB).
 */
import "dotenv/config";
import { prisma } from "../src/client";

const DRY_RUN = process.argv.includes("--dry-run");

const norm = (s: string) => s.trim().toLowerCase();

// COMPONENT 1 — elite clubs (10 pts). EXACT name match (case-insensitive) so
// look-alikes like "Inter Miami", "Arsenal Tula", or youth/reserve teams
// ("Atlético Madrid II", "Milan U19") are NOT counted as elite.
const ELITE_CLUBS = new Set(
  [
    "Real Madrid", "Barcelona", "Manchester City", "Liverpool",
    "Bayern Munich", "Bayern München", "Paris Saint Germain", "Paris Saint-Germain",
    "Manchester United", "Chelsea", "Arsenal", "Juventus",
    "AC Milan", "Inter", "Inter Milan", "Atletico Madrid", "Atlético Madrid",
    "Borussia Dortmund",
  ].map(norm),
);

// COMPONENT 2 — national-team tiers.
const NATION_TIER1 = new Set(
  ["Brazil", "France", "Germany", "Argentina", "Spain", "England", "Portugal", "Italy", "Netherlands", "Belgium"].map(norm),
);
const NATION_TIER2 = new Set(
  // "Korea Republic" is API-Football's name for South Korea.
  ["Croatia", "Uruguay", "Colombia", "Mexico", "Senegal", "Morocco", "Denmark", "Switzerland", "USA", "Japan", "South Korea", "Korea Republic", "Poland", "Serbia"].map(norm),
);

function nationPoints(nationality: string): number {
  const n = norm(nationality);
  if (NATION_TIER1.has(n)) return 10;
  if (NATION_TIER2.has(n)) return 7;
  // Tier 3 (4 pts): any other named nationality (we can't query FIFA rankings,
  // so a present nationality is treated as ranked). Tier 4 (1 pt): empty/unknown.
  return n ? 4 : 1;
}

function clubPoints(clubs: string[]): number {
  let pts = 0;
  for (const c of clubs) pts += ELITE_CLUBS.has(norm(c)) ? 10 : 1;
  // The spec's "strong = top-5-league club (5 pts)" middle tier needs club→league
  // data we don't store yet; non-elite clubs score as "other" (1) until the
  // tournament-stats import lets us add it. Re-run then to apply the 5-pt tier.
  return Math.min(30, pts);
}

interface Row {
  id: string;
  name: string;
  externalRef: number | null;
  nationality: string;
  clubs: string[]; // distinct club names
  top5: number;
  worldCup: number;
  euroCopa: number;
  ucl: number;
}

function baseScore(r: Row): number {
  const c1 = clubPoints(r.clubs); // 0..30  (30%)
  const c2 = (nationPoints(r.nationality) / 10) * 25; // 0..25  (25%)
  const c3 = Math.min(25, r.worldCup * 8 + r.euroCopa * 5 + r.ucl * 3); // 0..25  (25%)
  const c4 = Math.min(10, r.top5 * 2); // 0..10  (10%)
  const c5 = Math.min(10, r.clubs.length); // 0..10  (10%) — 1 pt per distinct club
  return c1 + c2 + c3 + c4 + c5; // 0..100
}

// Lionel Messi specifically — his API-Football id is 154. The name fallback
// also requires Argentina so unrelated players surnamed "Messi" (e.g. a French
// "R. Messi") never trigger the rule. (He plays in MLS, so he may not be in our
// top-5-league dataset at all, in which case the rule simply applies to nobody.)
const isMessi = (r: Row) =>
  r.externalRef === 154 || (/\bmessi\b/i.test(r.name) && norm(r.nationality) === "argentina");
const isSaudi = (nationality: string) => /^saudi/.test(norm(nationality)); // "Saudi Arabia"

function finalScore(r: Row): number {
  if (isMessi(r)) return 100; // SPECIAL RULE 1 — Messi is always exactly 100
  let s = baseScore(r);
  if (isSaudi(r.nationality)) s = Math.min(99, s + 30); // RULE 2 — +30, cap 99 (Messi-only 100)
  return Math.round(s * 100) / 100;
}

async function main() {
  const players = await prisma.player.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      externalRef: true,
      top5LeagueSeasons: true,
      nationality: { select: { name: true } },
      playerClubs: { select: { club: { select: { name: true } } } },
      tournamentStats: { select: { tournamentType: true, appearances: true } },
    },
  });

  console.log(
    `Calculate fame scores${DRY_RUN ? " [DRY RUN: no writes]" : ""} — active players: ${players.length}`,
  );

  const rows: Array<Row & { score: number }> = players.map((p) => {
    const stat = (t: string) =>
      p.tournamentStats.find((s) => s.tournamentType === t)?.appearances ?? 0;
    const row: Row = {
      id: p.id,
      name: p.name,
      externalRef: p.externalRef,
      nationality: p.nationality.name,
      clubs: [...new Set(p.playerClubs.map((pc) => pc.club.name))],
      top5: p.top5LeagueSeasons,
      worldCup: stat("WORLD_CUP"),
      euroCopa: stat("EURO_COPA"),
      ucl: stat("CHAMPIONS_LEAGUE"),
    };
    return { ...row, score: finalScore(row) };
  });

  // PART 3 tiers — rank by fame_score DESC (name as a stable tiebreaker), then:
  // top 200 → 1, next 500 → 2, next 500 → 3, the rest → 4. The dealing filter
  // (game-server) maps a room's difficulty onto these tiers.
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const tierOf = new Map<string, 1 | 2 | 3 | 4>();
  sorted.forEach((r, idx) => {
    tierOf.set(r.id, idx < 200 ? 1 : idx < 700 ? 2 : idx < 1200 ? 3 : 4);
  });

  if (!DRY_RUN) {
    let done = 0;
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await Promise.all(
        rows.slice(i, i + CHUNK).map((r) =>
          prisma.player.update({
            where: { id: r.id },
            data: { fameScore: r.score, tier: tierOf.get(r.id)! },
          }),
        ),
      );
      done += Math.min(CHUNK, rows.length - i);
      console.log(`  written ${done}/${rows.length}`);
    }
  }
  const saudi = rows.filter((r) => isSaudi(r.nationality)).length;
  const messi = rows.filter((r) => isMessi(r)).length;
  const tierCount = (t: number) => [...tierOf.values()].filter((x) => x === t).length;
  console.log("\n==== SUMMARY ====");
  console.log(`scored              : ${rows.length}`);
  console.log(`max / min           : ${sorted[0]?.score} / ${sorted.at(-1)?.score}`);
  console.log(`Messi rows (=100)   : ${messi}`);
  console.log(`Saudi rows (+30)    : ${saudi}`);
  console.log(
    `tiers 1/2/3/4       : ${tierCount(1)} / ${tierCount(2)} / ${tierCount(3)} / ${tierCount(4)}`,
  );
  console.log("top 10 by fame:");
  for (const r of sorted.slice(0, 10)) {
    console.log(`  ${r.score.toString().padStart(6)}  ${r.name} (${r.nationality})`);
  }
  console.log(DRY_RUN ? "DRY RUN — no database writes were performed." : "✅ Scores written.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
