/**
 * Computes players.fame_score (0-100) for every ACTIVE player.
 *
 *   pnpm db:calculate-scores            # write fame_score for all active players
 *   pnpm db:calculate-scores --dry-run  # compute + print top/bottom, NO writes
 *
 * SCORING SYSTEM — six weighted components, each NORMALIZED AGAINST MESSI:
 *   top-5 league seasons        20%
 *   club strength (elite list)  20%   Σ over distinct clubs (elite 10, else 1)
 *   big-tournament seasons      20%   WorldCup*8 + Euro/Copa*5 + UCL*3
 *   national-team strength      20%   tier points (10 / 7 / 4 / 0)
 *   distinct clubs              10%
 *   legend cards                10%   0 for everyone until legends are defined
 *
 * Messi is the SOLE benchmark and the unique ceiling (pinned to exactly 100). For
 * every other player, each component is normalized against Messi and scaled to a
 * 0.99 ceiling: component = 0.99 * min(1, player_raw / Messi_raw) * weight. A
 * player who meets/exceeds Messi sits 1% below him on that component (0.99*weight),
 * smoothly — continuous at ratio=1, no discontinuity, ordering preserved — and
 * below weight for everyone, so no one reaches Messi on any component or overall
 * (normalized players max 0.99*90 = 89.1).
 *
 * Cristiano Ronaldo is a FIXED final-score exception at 99 (override only, NOT a
 * benchmark — it never affects how any other player is normalized).
 *
 * Missing inputs contribute 0 (no skip/throw). Tournament inputs come from the
 * tournament-stats import; players not yet imported get 0 there. Re-run after the
 * import completes to fold the remaining tournament data in.
 */
import "dotenv/config";
import { prisma } from "../src/client";

const DRY_RUN = process.argv.includes("--dry-run");

const norm = (s: string) => s.trim().toLowerCase();

// Club-strength reference: EXACT name match (case-insensitive) so look-alikes
// ("Inter Miami", "Arsenal Tula") and youth/reserve teams ("Atlético Madrid II")
// are NOT counted as elite.
const ELITE_CLUBS = new Set(
  [
    "Real Madrid", "Barcelona", "Manchester City", "Liverpool",
    "Bayern Munich", "Bayern München", "Paris Saint Germain", "Paris Saint-Germain",
    "Manchester United", "Chelsea", "Arsenal", "Juventus",
    "AC Milan", "Inter", "Inter Milan", "Atletico Madrid", "Atlético Madrid",
    "Borussia Dortmund",
  ].map(norm),
);

// National-team tiers.
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
  // Any other named nationality = 4; missing/empty = 0 (its component → 0).
  return n ? 4 : 0;
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

// --- raw component values (un-normalized; missing data → 0) ---------------
const top5Raw = (r: Row) => r.top5;
const clubStrengthRaw = (r: Row) =>
  r.clubs.reduce((sum, c) => sum + (ELITE_CLUBS.has(norm(c)) ? 10 : 1), 0);
const tournamentRaw = (r: Row) => r.worldCup * 8 + r.euroCopa * 5 + r.ucl * 3;
const nationRaw = (r: Row) => nationPoints(r.nationality);
const distinctClubsRaw = (r: Row) => r.clubs.length;
const legendRaw = (_r: Row) => 0; // legends not defined yet → 0 for everyone

// Weights sum to 100. Legend is present at 10% but contributes 0 until defined.
const WEIGHTS = {
  top5: 20,
  club: 20,
  tournament: 20,
  nation: 20,
  distinctClubs: 10,
  legend: 10,
} as const;

// A player who meets/exceeds Messi on a component sits this fraction of his full
// weight — i.e. 1% below Messi. The smooth normalization scales to this ceiling.
const COMPONENT_CEILING = 0.99;

interface Benchmark {
  top5: number;
  club: number;
  tournament: number;
  nation: number;
  distinctClubs: number;
  legend: number;
}
const benchmarkOf = (r: Row): Benchmark => ({
  top5: top5Raw(r),
  club: clubStrengthRaw(r),
  tournament: tournamentRaw(r),
  nation: nationRaw(r),
  distinctClubs: distinctClubsRaw(r),
  legend: legendRaw(r),
});

/**
 * One component, normalized against Messi. Below Messi → linear share of the
 * weight; MEET OR EXCEED Messi (ratio >= 1) → hard-capped to 10% below him
 * (0.9 * weight), so no one can equal/exceed Messi on the component. A zero
 * benchmark (e.g. legend, until defined) contributes 0 for everyone.
 */
function componentScore(raw: number, messiRaw: number, weight: number): number {
  if (messiRaw <= 0) return 0;
  const ratio = raw / messiRaw;
  // Smooth normalization scaled to the ceiling: below Messi → ceiling*ratio*weight;
  // meet/exceed Messi → ceiling*weight (1% below him). Continuous at ratio=1 (no
  // discontinuity), monotonic (ordering preserved), and < weight for everyone, so
  // no one reaches Messi on the component.
  return COMPONENT_CEILING * Math.min(1, ratio) * weight;
}

// Lionel Messi specifically — API-Football id 154. The name fallback also
// requires Argentina so unrelated players surnamed "Messi" never match.
const isMessi = (r: Row) =>
  r.externalRef === 154 || (/\bmessi\b/i.test(r.name) && norm(r.nationality) === "argentina");

// Cristiano Ronaldo (API-Football id 874) — a FIXED final-score exception at 99,
// NOT a normalization benchmark. The name fallback requires Portugal so the
// Brazilian "Ronaldo" (Nazário) never matches.
const isRonaldo = (r: Row) =>
  r.externalRef === 874 ||
  (/\bcristiano ronaldo\b/i.test(r.name) && norm(r.nationality) === "portugal");

function finalScore(r: Row, m: Benchmark): number {
  if (isMessi(r)) return 100; // Messi is the unique ceiling (pinned).
  if (isRonaldo(r)) return 99; // fixed exception — override only, not a benchmark.
  const s =
    componentScore(top5Raw(r), m.top5, WEIGHTS.top5) +
    componentScore(clubStrengthRaw(r), m.club, WEIGHTS.club) +
    componentScore(tournamentRaw(r), m.tournament, WEIGHTS.tournament) +
    componentScore(nationRaw(r), m.nation, WEIGHTS.nation) +
    componentScore(distinctClubsRaw(r), m.distinctClubs, WEIGHTS.distinctClubs) +
    componentScore(legendRaw(r), m.legend, WEIGHTS.legend);
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

  const baseRows: Row[] = players.map((p) => {
    const stat = (t: string) =>
      p.tournamentStats.find((s) => s.tournamentType === t)?.appearances ?? 0;
    return {
      id: p.id,
      name: p.name,
      externalRef: p.externalRef,
      // Missing inputs default to zero for their component (no skip/throw):
      // nationality → "" (0 pts), clubs → [] (0 pts), tournament stats → 0.
      nationality: p.nationality?.name ?? "",
      clubs: [...new Set(p.playerClubs.map((pc) => pc.club.name))],
      top5: p.top5LeagueSeasons,
      worldCup: stat("WORLD_CUP"),
      euroCopa: stat("EURO_COPA"),
      ucl: stat("CHAMPIONS_LEAGUE"),
    };
  });

  // Messi is the benchmark every component is normalized against. Without him
  // there is no reference, so fail loudly rather than score everyone wrong.
  const messiRow = baseRows.find(isMessi);
  if (!messiRow) {
    throw new Error("Benchmark player Messi (external_ref 154) not found among active players.");
  }
  const M = benchmarkOf(messiRow);
  console.log(
    `Messi benchmark — top5:${M.top5} club:${M.club} tourn:${M.tournament} nation:${M.nation} clubs:${M.distinctClubs} legend:${M.legend}`,
  );

  const rows = baseRows.map((r) => ({ ...r, score: finalScore(r, M) }));

  // Tiers — rank by fame_score DESC (name as a stable tiebreaker): top 200 → 1,
  // next 500 → 2, next 500 → 3, the rest → 4.
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

  const messiCount = rows.filter((r) => isMessi(r)).length;
  const ronaldoScore = rows.find((r) => isRonaldo(r))?.score ?? null;
  // Top of the NORMALIZED field (excluding the two fixed exceptions).
  const topNormalized = sorted.find((r) => !isMessi(r) && !isRonaldo(r))?.score ?? 0;
  const tierCount = (t: number) => [...tierOf.values()].filter((x) => x === t).length;
  console.log("\n==== SUMMARY ====");
  console.log(`scored                 : ${rows.length}`);
  console.log(`Messi (=100) rows      : ${messiCount}`);
  console.log(`Ronaldo (=99)          : ${ronaldoScore}`);
  console.log(`top normalized / min   : ${topNormalized} / ${sorted.at(-1)?.score}`);
  console.log(
    `tiers 1/2/3/4          : ${tierCount(1)} / ${tierCount(2)} / ${tierCount(3)} / ${tierCount(4)}`,
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
