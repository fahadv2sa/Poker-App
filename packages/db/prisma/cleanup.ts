/**
 * UNIFIED cleanup — BOTH games + the Top Ten catalog. Safe by default (DRY RUN);
 * pass --confirm to delete. Batched, FK-aware, and it snapshots every table that MUST
 * survive (financial ledger, stats, wallet balances, Top Ten progression + XP) BEFORE
 * and AFTER, printing both — so a run proves nothing financial/progression/audit changed.
 *
 *   pnpm db:cleanup                     # DRY RUN (default): report only, NO delete
 *   pnpm db:cleanup --confirm           # delete (retention 90d for games/matches)
 *   pnpm db:cleanup --confirm --days=30 --batch=500
 *   pnpm db:cleanup --confirm --no-catalog   # skip the catalog-generation prune
 *
 * Scope & FK behaviour (all defined on the schema):
 *  1) Link Up : ABANDONED games with ended_at < cutoff.
 *       CASCADE  → game_players, game_cards, bets, player_hand_claims, game_results
 *       SetNull  → wallet_transactions, play_events  (ROWS KEPT — ledger/analytics)
 *  2) Top Ten : terminal matches (ENDED/ABANDONED) with ended_at < cutoff.
 *       CASCADE  → tt_rounds → tt_round_reveals, tt_match_players
 *       UNTOUCHED→ tt_progression (per-user), tt_xp_events (no FK to match) — the
 *                  progression/XP source of truth survives, mirroring Link Up's ledger.
 *  3) Catalog : superseded generations (tt_catalog_entry active=false → CASCADE
 *       tt_catalog_player) + stale tt_difficulty_config; keeps the ACTIVE generation.
 *       NOT age-gated — an inactive generation is already superseded by the active one.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { prisma } from "../src/client";

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string, d: number) => {
  const a = argv.find((x) => x.startsWith(`${f}=`));
  return a ? Number(a.slice(f.length + 1)) : d;
};
const CONFIRM = flag("--confirm");
const DAYS = opt("--days", 90);
const BATCH = opt("--batch", 500);
const NO_CATALOG = flag("--no-catalog");

/** Counts + sums for every table that MUST survive the purge (both games). */
async function keepSnapshot() {
  const [wtxRows, wtxSum, pevRows, statNet, balSum, progRows, progXp, xpRows, xpSum] = await Promise.all([
    prisma.walletTransaction.count(),
    prisma.walletTransaction.aggregate({ _sum: { amount: true } }),
    prisma.playEvent.count(),
    prisma.userStats.aggregate({ _sum: { netProfitLoss: true } }),
    prisma.wallet.aggregate({ _sum: { balance: true } }),
    prisma.ttProgression.count(),
    prisma.ttProgression.aggregate({ _sum: { xp: true } }),
    prisma.ttXpEvent.count(),
    prisma.ttXpEvent.aggregate({ _sum: { amount: true } }),
  ]);
  return {
    walletTxRows: wtxRows,
    walletTxAmountSum: wtxSum._sum.amount ?? 0n,
    playEventRows: pevRows,
    userStatsNetSum: statNet._sum.netProfitLoss ?? 0n,
    walletBalanceSum: balSum._sum.balance ?? 0n,
    ttProgressionRows: progRows,
    ttProgressionXpSum: progXp._sum.xp ?? 0n,
    ttXpEventRows: xpRows,
    ttXpAmountSum: xpSum._sum.amount ?? 0,
  };
}

async function main() {
  if (!Number.isFinite(DAYS) || DAYS < 0) throw new Error(`--days must be >= 0 (got ${DAYS})`);
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  console.log(
    `UNIFIED cleanup — retention ${DAYS}d (cutoff ${cutoff.toISOString()})${CONFIRM ? "" : "  [DRY RUN: no deletes]"}`,
  );

  // ---------- 1) LINK UP: ABANDONED games ----------
  const luWhere = { status: "ABANDONED" as const, endedAt: { lt: cutoff } };
  const luGames = await prisma.game.count({ where: luWhere });
  const luIds = (await prisma.game.findMany({ where: luWhere, select: { id: true } })).map((g) => g.id);
  const luIn = { gameId: { in: luIds } };
  const [players, cards, bets, claims, results, keptTx, keptEv] = await Promise.all([
    prisma.gamePlayer.count({ where: luIn }),
    prisma.gameCard.count({ where: luIn }),
    prisma.bet.count({ where: luIn }),
    prisma.playerHandClaim.count({ where: luIn }),
    prisma.gameResult.count({ where: luIn }),
    prisma.walletTransaction.count({ where: luIn }),
    prisma.playEvent.count({ where: luIn }),
  ]);
  console.log(`\n[Link Up] ABANDONED games (ended_at < cutoff): ${luGames}`);
  console.log(`  CASCADE-DELETE → game_players=${players} game_cards=${cards} bets=${bets} claims=${claims} results=${results}`);
  console.log(`  KEEP (game_id→NULL) → wallet_transactions=${keptTx} play_events=${keptEv}`);

  // ---------- 2) TOP TEN: terminal matches ----------
  const ttWhere = { status: { in: ["ENDED", "ABANDONED"] as ("ENDED" | "ABANDONED")[] }, endedAt: { lt: cutoff } };
  const ttMatches = await prisma.ttMatch.count({ where: ttWhere });
  const ttIds = (await prisma.ttMatch.findMany({ where: ttWhere, select: { id: true } })).map((m) => m.id);
  const [ttSeats, ttRounds] = await Promise.all([
    prisma.ttMatchPlayer.count({ where: { matchId: { in: ttIds } } }),
    prisma.ttRound.count({ where: { matchId: { in: ttIds } } }),
  ]);
  const ttReveals = ttIds.length
    ? await prisma.ttRoundReveal.count({ where: { round: { matchId: { in: ttIds } } } })
    : 0;
  console.log(`\n[Top Ten] terminal matches (ENDED/ABANDONED, ended_at < cutoff): ${ttMatches}`);
  console.log(`  CASCADE-DELETE → tt_match_players=${ttSeats} tt_rounds=${ttRounds} tt_round_reveals=${ttReveals}`);
  console.log(`  UNTOUCHED → tt_progression, tt_xp_events (verified below)`);

  // ---------- 3) CATALOG: superseded generations ----------
  let catEntries = 0, catPlayers = 0, catCfg = 0;
  if (!NO_CATALOG) {
    catEntries = await prisma.ttCatalogEntry.count({ where: { active: false } });
    catPlayers = await prisma.ttCatalogPlayer.count({ where: { entry: { active: false } } });
    const latestCfg = await prisma.ttDifficultyConfig.findFirst({ orderBy: { builtAt: "desc" }, select: { builtAt: true } });
    catCfg = latestCfg ? await prisma.ttDifficultyConfig.count({ where: { builtAt: { lt: latestCfg.builtAt } } }) : 0;
    console.log(`\n[Catalog] superseded (active=false): entries=${catEntries} players=${catPlayers} + stale difficulty_config=${catCfg}`);
  } else {
    console.log(`\n[Catalog] skipped (--no-catalog)`);
  }

  if (!CONFIRM) {
    console.log(`\nDRY RUN — nothing deleted. Re-run with --confirm to delete.`);
    return;
  }

  // ---------- real purge (snapshot → delete in batches → re-snapshot) ----------
  const before = await keepSnapshot();

  let g = 0;
  for (;;) {
    const b = await prisma.game.findMany({ where: luWhere, select: { id: true }, orderBy: { endedAt: "asc" }, take: BATCH });
    if (b.length === 0) break;
    g += (await prisma.game.deleteMany({ where: { id: { in: b.map((x) => x.id) } } })).count;
  }
  console.log(`\ndeleted Link Up games: ${g}`);

  let m = 0;
  for (;;) {
    const b = await prisma.ttMatch.findMany({ where: ttWhere, select: { id: true }, orderBy: { endedAt: "asc" }, take: BATCH });
    if (b.length === 0) break;
    m += (await prisma.ttMatch.deleteMany({ where: { id: { in: b.map((x) => x.id) } } })).count;
  }
  console.log(`deleted Top Ten matches: ${m}`);

  if (!NO_CATALOG) {
    // delete inactive entries in batches (tt_catalog_player cascades on the FK)
    let e = 0;
    for (;;) {
      const b = await prisma.ttCatalogEntry.findMany({ where: { active: false }, select: { id: true }, take: BATCH });
      if (b.length === 0) break;
      e += (await prisma.ttCatalogEntry.deleteMany({ where: { id: { in: b.map((x) => x.id) } } })).count;
    }
    const latestCfg = await prisma.ttDifficultyConfig.findFirst({ orderBy: { builtAt: "desc" }, select: { builtAt: true } });
    const cfgDel = latestCfg ? (await prisma.ttDifficultyConfig.deleteMany({ where: { builtAt: { lt: latestCfg.builtAt } } })).count : 0;
    console.log(`pruned catalog: entries=${e} (players cascaded) + difficulty_config=${cfgDel}`);
  }

  const after = await keepSnapshot();
  const same = <T>(a: T, b: T) => a === b;
  const unchanged =
    same(before.walletTxRows, after.walletTxRows) &&
    same(before.walletTxAmountSum, after.walletTxAmountSum) &&
    same(before.playEventRows, after.playEventRows) &&
    same(before.userStatsNetSum, after.userStatsNetSum) &&
    same(before.walletBalanceSum, after.walletBalanceSum) &&
    same(before.ttProgressionRows, after.ttProgressionRows) &&
    same(before.ttProgressionXpSum, after.ttProgressionXpSum) &&
    same(before.ttXpEventRows, after.ttXpEventRows) &&
    same(before.ttXpAmountSum, after.ttXpAmountSum);

  console.log(`\n==== KEEP-TABLE VERIFICATION (before → after) ====`);
  console.log(`Link Up  wallet_transactions rows : ${before.walletTxRows} → ${after.walletTxRows}`);
  console.log(`Link Up  wallet_transactions Σamt : ${before.walletTxAmountSum} → ${after.walletTxAmountSum}`);
  console.log(`Link Up  play_events rows         : ${before.playEventRows} → ${after.playEventRows}`);
  console.log(`Link Up  user_stats Σnet          : ${before.userStatsNetSum} → ${after.userStatsNetSum}`);
  console.log(`Link Up  wallet Σbalance          : ${before.walletBalanceSum} → ${after.walletBalanceSum}`);
  console.log(`Top Ten  tt_progression rows      : ${before.ttProgressionRows} → ${after.ttProgressionRows}`);
  console.log(`Top Ten  tt_progression Σxp       : ${before.ttProgressionXpSum} → ${after.ttProgressionXpSum}`);
  console.log(`Top Ten  tt_xp_events rows        : ${before.ttXpEventRows} → ${after.ttXpEventRows}`);
  console.log(`Top Ten  tt_xp_events Σamt        : ${before.ttXpAmountSum} → ${after.ttXpAmountSum}`);
  console.log(unchanged ? "✅ KEEP tables UNCHANGED." : "❌ KEEP tables CHANGED — investigate!");
  if (!unchanged) process.exitCode = 1;
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
