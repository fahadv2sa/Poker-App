/**
 * Abandoned-room cleanup (Option A). Deletes Game rows that have been ABANDONED
 * (host close / auto-empty / boot-recovery) for longer than the retention window,
 * in batches. NEVER touches IN_PROGRESS/ENDED/LOBBY games (ENDED is a still-live
 * between-hands session). Relies on the existing FK rules:
 *   - KEEP (onDelete: SetNull, game_id -> NULL): wallet_transactions (the ledger,
 *     financial source of truth) and play_events (analytics log). The ROWS stay.
 *   - DELETE (onDelete: Cascade): game_players, game_cards, bets,
 *     player_hand_claims, game_results (transient per-game records).
 *   - Untouched: UserStats / PlayerMetrics / wallet balances (independent of the
 *     Game row).
 * Boot-recovery only reads IN_PROGRESS games, so deleting ABANDONED ones is safe.
 *
 *   pnpm db:cleanup-abandoned                  # DRY RUN (default): report only, NO delete
 *   pnpm db:cleanup-abandoned --days=90        # retention window (default 90)
 *   pnpm db:cleanup-abandoned --confirm        # actually delete (batched)
 *   pnpm db:cleanup-abandoned --confirm --days=30 --batch=500
 *
 * SAFE BY DEFAULT: without --confirm it only counts/reports. With --confirm it
 * snapshots the KEEP tables (wallet_transactions / play_events / user_stats /
 * wallet balances) before AND after the purge and prints both, so a run on a prod
 * COPY proves nothing financial/analytical changed.
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

/** Counts + financial sums for every table that MUST survive the purge. */
async function keepSnapshot() {
  const [wtxRows, wtxSum, pevRows, statNet, balSum] = await Promise.all([
    prisma.walletTransaction.count(),
    prisma.walletTransaction.aggregate({ _sum: { amount: true } }),
    prisma.playEvent.count(),
    prisma.userStats.aggregate({ _sum: { netProfitLoss: true } }),
    prisma.wallet.aggregate({ _sum: { balance: true } }),
  ]);
  return {
    walletTxRows: wtxRows,
    walletTxAmountSum: wtxSum._sum.amount ?? 0n,
    playEventRows: pevRows,
    userStatsNetSum: statNet._sum.netProfitLoss ?? 0n,
    walletBalanceSum: balSum._sum.balance ?? 0n,
  };
}

async function main() {
  if (!Number.isFinite(DAYS) || DAYS < 0) throw new Error(`--days must be >= 0 (got ${DAYS})`);
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  console.log(
    `Abandoned-room cleanup — retention ${DAYS}d (cutoff ${cutoff.toISOString()})` +
      `${CONFIRM ? "" : "  [DRY RUN: no deletes]"}`,
  );

  // Candidate games: ABANDONED and terminal (ended_at) before the cutoff.
  const where = { status: "ABANDONED" as const, endedAt: { lt: cutoff } };
  const candidates = await prisma.game.count({ where });
  console.log(`candidate ABANDONED games (ended_at < cutoff): ${candidates}`);
  if (candidates === 0) {
    console.log("nothing to do.");
    return;
  }

  // Footprint: cascade-deleted children vs kept (SetNull) ledger/analytics rows.
  const ids = (await prisma.game.findMany({ where, select: { id: true } })).map((g) => g.id);
  const inIds = { gameId: { in: ids } };
  const [players, cards, bets, claims, results, keptTx, keptEv] = await Promise.all([
    prisma.gamePlayer.count({ where: inIds }),
    prisma.gameCard.count({ where: inIds }),
    prisma.bet.count({ where: inIds }),
    prisma.playerHandClaim.count({ where: inIds }),
    prisma.gameResult.count({ where: inIds }),
    prisma.walletTransaction.count({ where: inIds }),
    prisma.playEvent.count({ where: inIds }),
  ]);
  console.log(
    `would CASCADE-DELETE → game_players=${players} game_cards=${cards} bets=${bets} ` +
      `player_hand_claims=${claims} game_results=${results}`,
  );
  console.log(`would KEEP (game_id → NULL) → wallet_transactions=${keptTx} play_events=${keptEv}`);

  if (!CONFIRM) {
    console.log("\nDRY RUN — no rows were deleted. Re-run with --confirm to delete.");
    return;
  }

  // ---- real purge: snapshot KEEP tables, delete in batches, re-snapshot ----
  const before = await keepSnapshot();

  let deleted = 0;
  for (;;) {
    const batch = await prisma.game.findMany({
      where,
      select: { id: true },
      orderBy: { endedAt: "asc" }, // oldest first
      take: BATCH,
    });
    if (batch.length === 0) break;
    // Deleting the Game triggers the DB-level cascade (children) + SetNull
    // (ledger/events) defined on the FKs.
    const res = await prisma.game.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
    deleted += res.count;
    console.log(`  deleted ${deleted}/${candidates} games…`);
  }

  const after = await keepSnapshot();
  const unchanged =
    before.walletTxRows === after.walletTxRows &&
    before.walletTxAmountSum === after.walletTxAmountSum &&
    before.playEventRows === after.playEventRows &&
    before.userStatsNetSum === after.userStatsNetSum &&
    before.walletBalanceSum === after.walletBalanceSum;

  console.log("\n==== KEEP-TABLE VERIFICATION (before → after) ====");
  console.log(`wallet_transactions rows : ${before.walletTxRows} → ${after.walletTxRows}`);
  console.log(`wallet_transactions Σamt : ${before.walletTxAmountSum} → ${after.walletTxAmountSum}`);
  console.log(`play_events rows         : ${before.playEventRows} → ${after.playEventRows}`);
  console.log(`user_stats Σnet          : ${before.userStatsNetSum} → ${after.userStatsNetSum}`);
  console.log(`wallet Σbalance          : ${before.walletBalanceSum} → ${after.walletBalanceSum}`);
  console.log(unchanged ? "✅ KEEP tables UNCHANGED." : "❌ KEEP tables CHANGED — investigate before prod!");
  console.log(`\nDeleted ${deleted} ABANDONED game(s) older than ${DAYS}d.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
