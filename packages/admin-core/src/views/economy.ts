import { prisma } from "@fb/db";

/** A recent ledger movement across all users (global financial visibility). */
export interface GlobalLedgerEntry {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  username: string;
  playerNumber: number;
  gameId: string | null;
  createdAt: string;
}

export async function recentLedger(opts: { take?: number } = {}): Promise<GlobalLedgerEntry[]> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const rows = await prisma.walletTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      amount: true,
      balanceAfter: true,
      gameId: true,
      createdAt: true,
      user: { select: { username: true, playerNumber: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: t.amount.toString(),
    balanceAfter: t.balanceAfter.toString(),
    username: t.user.username,
    playerNumber: t.user.playerNumber,
    gameId: t.gameId,
    createdAt: t.createdAt.toISOString(),
  }));
}
