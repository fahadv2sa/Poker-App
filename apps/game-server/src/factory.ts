import { prisma } from "@fp/db";
import { parseRule, type HandRankDef } from "@fp/engine";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "@fp/shared";
import type { RoomPlayer, RoomState } from "./types.js";

/**
 * Builds in-memory room state from the database. HandRanks are read at runtime
 * (data-driven, Section 2.2) and their Rule DSL is validated via `parseRule`.
 */

/** Load the active hand ranks (id/code/strength + parsed rule) from the DB. */
export async function loadRanks(): Promise<HandRankDef[]> {
  const rows = await prisma.handRank.findMany({
    where: { active: true },
    select: { id: true, code: true, strength: true, rule: true },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    strength: r.strength,
    rule: parseRule(r.rule),
  }));
}

const emptyPlayer = (
  seat: number,
  userId: string,
  username: string,
  playerNumber: number,
  available: bigint,
): RoomPlayer => ({
  seat,
  userId,
  username,
  playerNumber,
  status: "WAITING",
  available,
  committedThisRound: 0n,
  committedTotal: 0n,
  lastBetAmount: 0n,
  hasActed: false,
  forfeit: 0n,
  holeCards: [],
  claimRankId: null,
  claimValid: false,
  claimStrength: 0,
  connected: true,
});

/** Hydrate a room (LOBBY) from its Game row, seating existing players. */
export async function hydrateRoom(
  gameId: string,
  ranks: HandRankDef[],
): Promise<RoomState | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      players: {
        where: { leftAt: null },
        include: { user: { select: { username: true, playerNumber: true, wallet: true } } },
      },
    },
  });
  if (!game) return null;

  const players: RoomPlayer[] = game.players.map((gp) =>
    emptyPlayer(
      gp.seat,
      gp.userId,
      gp.user.username,
      gp.user.playerNumber,
      gp.user.wallet?.balance ?? 0n,
    ),
  );

  const config = { ...DEFAULT_GAME_CONFIG, ...(game.config as Partial<GameConfig>) };

  return {
    gameId: game.id,
    roomName: game.roomName,
    inviteCode: game.inviteCode,
    createdBy: game.createdBy,
    maxPlayers: game.maxPlayers,
    isPrivate: game.isPrivate,
    config,
    status: game.status === "IN_PROGRESS" ? "IN_PROGRESS" : "LOBBY",
    phase: "LOBBY",
    players,
    community: [],
    communityRevealed: 0,
    dealerSeat: game.dealerSeat,
    currentTurnSeat: null,
    currentBet: 0n,
    turnDeadlineTs: null,
    ranks,
  };
}
