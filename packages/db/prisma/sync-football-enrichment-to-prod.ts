/**
 * One-time LOCAL → PROD football ENRICHMENT sync.
 *
 * Prod already has identical nationalities / positions / clubs / players /
 * player_clubs / national_teams / youth_clubs (audited: delta 0, every player
 * matches 1:1 by `external_ref`). The ONLY gap is:
 *   1. player bio columns (first/last name, birth date/place/country, height,
 *      weight) — UPDATE existing prod players by external_ref.
 *   2. player_tournament_stats (~16.7k) — INSERT into an empty prod table.
 *   3. player_season_stats   (~241k)  — INSERT into an empty prod table.
 *
 * SAFETY:
 *   - NEVER touches players/clubs/users/wallets/games — only the two child
 *     tables (additive) + bio columns on players (fills nulls).
 *   - Players are never inserted/deleted, so the game_cards → players FK is never
 *     involved.
 *   - Idempotent: the two child tables hold ONLY our data, so a real run wipes
 *     them and reloads (delete-all → batched insert). Bio updates are naturally
 *     idempotent. Safe to re-run.
 *   - DRY RUN by default. Writes happen ONLY with `--commit`.
 *
 *   PROD_DATABASE_URL=<prod>  pnpm --filter @fb/db exec tsx prisma/sync-football-enrichment-to-prod.ts
 *   PROD_DATABASE_URL=<prod>  ... sync-football-enrichment-to-prod.ts --commit
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { PrismaClient } from "../src/generated/client";

const COMMIT = process.argv.includes("--commit");
// --players-only: push the player columns (bio + scores + avg_rating) but SKIP
// the season/tournament wipe+reload (used when only player columns changed).
const PLAYERS_ONLY = process.argv.includes("--players-only");
const BATCH = 5000;

const PROD_URL = process.env.PROD_DATABASE_URL;
const LOCAL_URL = process.env.DATABASE_URL;
if (!PROD_URL) throw new Error("PROD_DATABASE_URL is required (the target prod DB).");
if (!LOCAL_URL) throw new Error("DATABASE_URL is required (the local source DB).");

const prod = new PrismaClient({ datasources: { db: { url: PROD_URL } } });
const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });

const BIO_FIELDS = [
  "firstName",
  "lastName",
  "birthDate",
  "birthPlace",
  "birthCountry",
  "heightCm",
  "weightKg",
] as const;

async function retry<T>(fn: () => Promise<T>, n = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= n) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
}

function log(...a: unknown[]) {
  console.log(...a);
}

async function main() {
  log(`\n=== Football enrichment sync — ${COMMIT ? "COMMIT (writes!)" : "DRY RUN (no writes)"} ===`);
  log("prod:", PROD_URL!.replace(/^.*@/, "").replace(/\/.*$/, ""));

  // 1) identity map: external_ref → prod player id, then local player id → prod id.
  const [prodPlayers, localPlayers] = await Promise.all([
    retry(() => prod.player.findMany({ where: { externalRef: { not: null } }, select: { id: true, externalRef: true } })),
    retry(() =>
      local.player.findMany({
        where: { externalRef: { not: null } },
        select: {
          id: true,
          externalRef: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          birthPlace: true,
          birthCountry: true,
          heightCm: true,
          weightKg: true,
          // recomputed scores + fame inputs (folded in after the imports)
          top5LeagueSeasons: true,
          fameScore: true,
          tier: true,
          isLegend: true,
          legendScore: true,
          avgRating: true,
        },
      }),
    ),
  ]);
  const refToProd = new Map<number, string>();
  for (const p of prodPlayers) refToProd.set(p.externalRef!, p.id);
  const localToProd = new Map<string, string>();
  let unmappable = 0;
  for (const p of localPlayers) {
    const pid = refToProd.get(p.externalRef!);
    if (pid) localToProd.set(p.id, pid);
    else unmappable++;
  }
  log(`\n[map] prod players w/ ref=${prodPlayers.length}  local w/ ref=${localPlayers.length}  mapped=${localToProd.size}  unmappable=${unmappable}`);

  // current prod state of the target tables
  const [prodSeasons, prodTour] = await Promise.all([
    retry(() => prod.playerSeasonStat.count()),
    retry(() => prod.playerTournamentStat.count()),
  ]);
  log(`[prod] player_season_stats=${prodSeasons}  player_tournament_stats=${prodTour} (target tables)`);

  // 2) player updates — bio + fame inputs + recomputed scores, for EVERY mapped
  //    player (scores/top5 apply to all, not just those carrying bio).
  const withBio = localPlayers.filter((p) => BIO_FIELDS.some((f) => p[f] !== null && p[f] !== undefined)).length;
  log(`\n[player] prod players to UPDATE (bio+scores): ${localPlayers.length}  (of which carry bio: ${withBio})`);

  // 3) tournament stats — orphan check via DB-side grouping
  const [tourTotal, tourGroups] = await Promise.all([
    retry(() => local.playerTournamentStat.count()),
    retry(() => local.playerTournamentStat.groupBy({ by: ["playerId"], _count: { _all: true } })),
  ]);
  const tourOrphans = tourGroups.filter((g) => !localToProd.has(g.playerId)).reduce((a, g) => a + g._count._all, 0);
  log(`[tournament] local rows=${tourTotal}  insert=${tourTotal - tourOrphans}  orphaned(no prod player)=${tourOrphans}`);

  // 4) season stats — orphan check via DB-side grouping
  const [seasonTotal, seasonGroups] = await Promise.all([
    retry(() => local.playerSeasonStat.count()),
    retry(() => local.playerSeasonStat.groupBy({ by: ["playerId"], _count: { _all: true } })),
  ]);
  const seasonOrphans = seasonGroups.filter((g) => !localToProd.has(g.playerId)).reduce((a, g) => a + g._count._all, 0);
  log(`[season] local rows=${seasonTotal}  insert=${seasonTotal - seasonOrphans}  orphaned(no prod player)=${seasonOrphans}  players=${seasonGroups.length}`);

  if (!COMMIT) {
    log(`\nDRY RUN complete — NO writes performed. Re-run with --commit to apply.`);
    return;
  }

  // ───────────────────────── WRITE PATH (only with --commit) ─────────────────
  log(`\n>>> COMMIT: applying to prod...`);

  // 2a) player updates — bio + fame inputs + recomputed scores (batched)
  let pDone = 0;
  for (let i = 0; i < localPlayers.length; i += 200) {
    const slice = localPlayers.slice(i, i + 200);
    await Promise.all(
      slice.map((p) =>
        retry(() =>
          prod.player.update({
            where: { externalRef: p.externalRef! },
            data: {
              firstName: p.firstName,
              lastName: p.lastName,
              birthDate: p.birthDate,
              birthPlace: p.birthPlace,
              birthCountry: p.birthCountry,
              heightCm: p.heightCm,
              weightKg: p.weightKg,
              top5LeagueSeasons: p.top5LeagueSeasons,
              fameScore: p.fameScore,
              tier: p.tier,
              isLegend: p.isLegend,
              legendScore: p.legendScore,
              avgRating: p.avgRating,
            },
          }),
        ),
      ),
    );
    pDone += slice.length;
    log(`[player] updated ${pDone}/${localPlayers.length}`);
  }

  if (PLAYERS_ONLY) {
    log(`\n[players-only] skipping season/tournament reload.`);
    const vFame = await retry(() => prod.player.count({ where: { avgRating: { not: null } } }));
    log(`[verify] prod players_with_avg_rating=${vFame}`);
    log(`COMMIT complete (players-only).`);
    return;
  }

  // 3a) tournament — wipe (our-data-only) then insert remapped
  await retry(() => prod.playerTournamentStat.deleteMany({}));
  const tourSrc = await retry(() => local.playerTournamentStat.findMany());
  let tourIns = 0;
  for (let i = 0; i < tourSrc.length; i += BATCH) {
    const data = tourSrc
      .slice(i, i + BATCH)
      .filter((r) => localToProd.has(r.playerId))
      .map((r) => ({ ...r, playerId: localToProd.get(r.playerId)! }));
    if (data.length) await retry(() => prod.playerTournamentStat.createMany({ data, skipDuplicates: true }));
    tourIns += data.length;
    log(`[tournament] inserted ${tourIns}/${tourTotal - tourOrphans}`);
  }

  // 4a) season — wipe then insert remapped, paginated by id cursor (memory-safe)
  await retry(() => prod.playerSeasonStat.deleteMany({}));
  let seasonIns = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await retry(() =>
      local.playerSeasonStat.findMany({
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
      }),
    );
    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;
    const data = page
      .filter((r) => localToProd.has(r.playerId))
      .map((r) => ({ ...r, playerId: localToProd.get(r.playerId)! }));
    if (data.length) await retry(() => prod.playerSeasonStat.createMany({ data, skipDuplicates: true }));
    seasonIns += data.length;
    log(`[season] inserted ${seasonIns}/${seasonTotal - seasonOrphans}`);
  }

  // verify
  const [vSeason, vTour, vBirth, vTop5, vFame] = await Promise.all([
    retry(() => prod.playerSeasonStat.count()),
    retry(() => prod.playerTournamentStat.count()),
    retry(() => prod.player.count({ where: { birthDate: { not: null } } })),
    retry(() => prod.player.count({ where: { top5LeagueSeasons: { gt: 0 } } })),
    retry(() => prod.player.count({ where: { fameScore: { not: null } } })),
  ]);
  log(`\n[verify] prod season_stats=${vSeason} tournament_stats=${vTour} birthDate=${vBirth} top5=${vTop5} fame=${vFame}`);
  log(`COMMIT complete.`);
}

main()
  .catch((e) => {
    console.error("SYNC FAILED:", (e as Error).message);
    process.exit(1);
  })
  .finally(async () => {
    await prod.$disconnect();
    await local.$disconnect();
  });
