import { prisma } from "@fb/db";
import { BOT_PLAYER_NUMBER_BASE } from "@fb/shared";

/**
 * Cross-domain headline counts for the dashboard home. All reads are aggregate
 * and admin-only — they never touch the gameplay hot path. Coin totals are
 * returned as strings (BigInt) for safe serialization.
 */
export interface OverviewCounts {
  users: { humans: number; bots: number; total: number; admins: number };
  economy: { wallets: number; totalCoins: string };
  games: { lobby: number; inProgress: number; ended: number; abandoned: number; total: number };
  football: { players: number; legends: number; clubs: number; nationalities: number };
}

export async function getOverview(): Promise<OverviewCounts> {
  const [humans, bots, admins, wallets, coinAgg, byStatus, players, legends, clubs, nationalities] =
    await Promise.all([
      prisma.user.count({ where: { playerNumber: { lt: BOT_PLAYER_NUMBER_BASE } } }),
      prisma.user.count({ where: { playerNumber: { gte: BOT_PLAYER_NUMBER_BASE } } }),
      prisma.admin.count(),
      prisma.wallet.count(),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.game.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.player.count(),
      prisma.player.count({ where: { isLegend: true } }),
      prisma.club.count(),
      prisma.nationality.count(),
    ]);

  const stat = (s: string) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
  const lobby = stat("LOBBY");
  const inProgress = stat("IN_PROGRESS");
  const ended = stat("ENDED");
  const abandoned = stat("ABANDONED");

  return {
    users: { humans, bots, total: humans + bots, admins },
    economy: { wallets, totalCoins: (coinAgg._sum.balance ?? 0n).toString() },
    games: { lobby, inProgress, ended, abandoned, total: lobby + inProgress + ended + abandoned },
    football: { players, legends, clubs, nationalities },
  };
}
