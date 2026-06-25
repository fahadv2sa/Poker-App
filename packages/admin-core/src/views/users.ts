import { prisma } from "@fb/db";
import { BOT_PLAYER_NUMBER_BASE } from "@fb/shared";

/** A wallet ledger row, BigInts stringified for safe serialization. */
export interface LedgerEntry {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  reference: string;
  gameId: string | null;
  createdAt: string;
}

export interface AdminUserListItem {
  id: string;
  playerNumber: number;
  username: string;
  nickname: string | null;
  email: string | null;
  emailVerified: boolean;
  balance: string;
  isBot: boolean;
  isAdmin: boolean;
  createdAt: string;
}

export interface UsersPage {
  items: AdminUserListItem[];
  total: number;
  take: number;
  skip: number;
}

function userWhere(q?: string) {
  const term = q?.trim();
  if (!term) return {};
  const or: object[] = [
    { username: { contains: term, mode: "insensitive" as const } },
    { email: { contains: term, mode: "insensitive" as const } },
  ];
  if (/^\d+$/.test(term)) or.push({ playerNumber: Number(term) });
  return { OR: or };
}

/** Paged user list with search by username / email / exact player number. */
export async function listUsers(
  opts: { q?: string; take?: number; skip?: number } = {},
): Promise<UsersPage> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const skip = Math.max(opts.skip ?? 0, 0);
  const where = userWhere(opts.q);

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        playerNumber: true,
        username: true,
        nickname: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        wallet: { select: { balance: true } },
        admin: { select: { role: true } },
      },
      orderBy: { playerNumber: "asc" },
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  const items: AdminUserListItem[] = rows.map((u) => ({
    id: u.id,
    playerNumber: u.playerNumber,
    username: u.username,
    nickname: u.nickname,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    balance: (u.wallet?.balance ?? 0n).toString(),
    isBot: u.playerNumber >= BOT_PLAYER_NUMBER_BASE,
    isAdmin: u.admin !== null,
    createdAt: u.createdAt.toISOString(),
  }));

  return { items, total, take, skip };
}

export interface AdminUserDetail {
  id: string;
  playerNumber: number;
  username: string;
  nickname: string | null;
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  isBot: boolean;
  likesReceived: number;
  lastActiveAt: string;
  createdAt: string;
  admin: { role: string; status: string } | null;
  wallet: { balance: string; highestBalance: string } | null;
  stats: {
    gamesPlayed: number;
    wins: number;
    losses: number;
    folds: number;
    netProfitLoss: string;
  } | null;
  level: number | null;
  xp: string | null;
  social: { friends: number; likesReceived: number };
  recentLedger: LedgerEntry[];
}

/** Full per-user visibility: identity, wallet, stats, progression, social, ledger. */
export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      playerNumber: true,
      username: true,
      nickname: true,
      email: true,
      emailVerifiedAt: true,
      disabledAt: true,
      likesReceived: true,
      lastActiveAt: true,
      createdAt: true,
      admin: { select: { role: true, status: true } },
      wallet: { select: { balance: true, highestBalance: true } },
      stats: {
        select: {
          gamesPlayed: true,
          wins: true,
          losses: true,
          folds: true,
          netProfitLoss: true,
        },
      },
      metrics: { select: { level: true, xp: true } },
    },
  });
  if (!u) return null;

  const [friends, ledger] = await Promise.all([
    prisma.friendship.count({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    }),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        reference: true,
        gameId: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    id: u.id,
    playerNumber: u.playerNumber,
    username: u.username,
    nickname: u.nickname,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    disabled: u.disabledAt !== null,
    isBot: u.playerNumber >= BOT_PLAYER_NUMBER_BASE,
    likesReceived: u.likesReceived,
    lastActiveAt: u.lastActiveAt.toISOString(),
    createdAt: u.createdAt.toISOString(),
    admin: u.admin ? { role: u.admin.role, status: u.admin.status } : null,
    wallet: u.wallet
      ? { balance: u.wallet.balance.toString(), highestBalance: u.wallet.highestBalance.toString() }
      : null,
    stats: u.stats
      ? {
          gamesPlayed: u.stats.gamesPlayed,
          wins: u.stats.wins,
          losses: u.stats.losses,
          folds: u.stats.folds,
          netProfitLoss: u.stats.netProfitLoss.toString(),
        }
      : null,
    level: u.metrics?.level ?? null,
    xp: u.metrics ? u.metrics.xp.toString() : null,
    social: { friends, likesReceived: u.likesReceived },
    recentLedger: ledger.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount.toString(),
      balanceAfter: t.balanceAfter.toString(),
      reference: t.reference,
      gameId: t.gameId,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/** Resolve a user id from a player number (for /admin/users/[playerNumber]). */
export async function findUserIdByPlayerNumber(playerNumber: number): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { playerNumber },
    select: { id: true },
  });
  return u?.id ?? null;
}
