import { prisma } from "@fb/db";

export interface AdminGameListItem {
  id: string;
  roomName: string;
  kind: string;
  status: string;
  phase: string;
  difficulty: string;
  maxPlayers: number;
  players: number;
  pot: string;
  createdBy: string;
  createdAt: string;
  endedAt: string | null;
}

export interface GamesPage {
  items: AdminGameListItem[];
  total: number;
  take: number;
  skip: number;
}

/** Paged game/session history, optionally filtered by status. */
export async function listGames(
  opts: { status?: string; take?: number; skip?: number } = {},
): Promise<GamesPage> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const skip = Math.max(opts.skip ?? 0, 0);
  const where = opts.status ? { status: opts.status as never } : {};

  const [rows, total] = await Promise.all([
    prisma.game.findMany({
      where,
      select: {
        id: true,
        roomName: true,
        kind: true,
        status: true,
        phase: true,
        difficulty: true,
        maxPlayers: true,
        pot: true,
        createdAt: true,
        endedAt: true,
        creator: { select: { username: true } },
        _count: { select: { players: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.game.count({ where }),
  ]);

  const items: AdminGameListItem[] = rows.map((g) => ({
    id: g.id,
    roomName: g.roomName,
    kind: g.kind,
    status: g.status,
    phase: g.phase,
    difficulty: g.difficulty,
    maxPlayers: g.maxPlayers,
    players: g._count.players,
    pot: g.pot.toString(),
    createdBy: g.creator.username,
    createdAt: g.createdAt.toISOString(),
    endedAt: g.endedAt ? g.endedAt.toISOString() : null,
  }));

  return { items, total, take, skip };
}

export interface GamePlayerRow {
  seat: number;
  playerNumber: number;
  username: string;
  status: string;
  committedTotal: string;
}

export interface GameResultRow {
  username: string;
  outcome: string;
  coinsDelta: string;
  finalBalance: string;
}

export interface AdminGameDetail {
  id: string;
  roomName: string;
  kind: string;
  status: string;
  phase: string;
  difficulty: string;
  maxPlayers: number;
  pot: string;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  players: GamePlayerRow[];
  results: GameResultRow[];
}

export async function getGameDetail(gameId: string): Promise<AdminGameDetail | null> {
  const g = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      roomName: true,
      kind: true,
      status: true,
      phase: true,
      difficulty: true,
      maxPlayers: true,
      pot: true,
      createdAt: true,
      startedAt: true,
      endedAt: true,
      creator: { select: { username: true } },
      players: {
        select: {
          seat: true,
          status: true,
          committedTotal: true,
          user: { select: { username: true, playerNumber: true } },
        },
        orderBy: { seat: "asc" },
      },
      results: {
        select: {
          outcome: true,
          coinsDelta: true,
          finalBalance: true,
          gamePlayer: { select: { user: { select: { username: true } } } },
        },
      },
    },
  });
  if (!g) return null;

  return {
    id: g.id,
    roomName: g.roomName,
    kind: g.kind,
    status: g.status,
    phase: g.phase,
    difficulty: g.difficulty,
    maxPlayers: g.maxPlayers,
    pot: g.pot.toString(),
    createdBy: g.creator.username,
    createdAt: g.createdAt.toISOString(),
    startedAt: g.startedAt ? g.startedAt.toISOString() : null,
    endedAt: g.endedAt ? g.endedAt.toISOString() : null,
    players: g.players.map((p) => ({
      seat: p.seat,
      playerNumber: p.user.playerNumber,
      username: p.user.username,
      status: p.status,
      committedTotal: p.committedTotal.toString(),
    })),
    results: g.results.map((r) => ({
      username: r.gamePlayer.user.username,
      outcome: r.outcome,
      coinsDelta: r.coinsDelta.toString(),
      finalBalance: r.finalBalance.toString(),
    })),
  };
}
