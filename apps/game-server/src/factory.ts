import { prisma } from "@fp/db";
import { parseRule } from "@fp/engine";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "@fp/shared";
import type { RankInfo, RoomPlayer, RoomState } from "./types.js";

/**
 * Builds in-memory room state from the database. HandRanks are read at runtime
 * (data-driven, Section 2.2) and their Rule DSL is validated via `parseRule`.
 */

/**
 * Load the active hand ranks from the DB: id/code/strength + parsed rule for
 * evaluation, plus `name_ar` for the showdown display name (data-driven — the
 * UI shows whatever the DB row says, no hardcoded names).
 */
export async function loadRanks(): Promise<RankInfo[]> {
  const rows = await prisma.handRank.findMany({
    where: { active: true },
    select: { id: true, code: true, strength: true, rule: true, nameAr: true },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    strength: r.strength,
    rule: parseRule(r.rule),
    nameAr: r.nameAr,
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
  ranks: RankInfo[],
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
  // A closed table is gone for good — never rebuild it from the DB (a late
  // rejoin to a closed room must fail, not resurrect it as a fresh lobby).
  if (game.status === "ABANDONED") return null;

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
    difficulty: game.difficulty,
    status: game.status === "IN_PROGRESS" ? "IN_PROGRESS" : "LOBBY",
    phase: "LOBBY",
    players,
    community: [],
    communityRevealed: 0,
    handNumber: 0,
    dealerSeat: game.dealerSeat,
    currentTurnSeat: null,
    currentBet: 0n,
    turnDeadlineTs: null,
    ranks,
  };
}
