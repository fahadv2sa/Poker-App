import { prisma } from "@fb/db";
import { levelForXp } from "@fb/top-10-engine";
import { isBotPlayerNumber, type TtStandingRow } from "@fb/shared";
import type { ActiveRound, MatchRoom, TtSeat } from "./types.js";

/**
 * Persistence for Top Ten — writes ONLY to the `top_10` schema. Never touches
 * football.* (read elsewhere through the catalog seam) or link_up.*. Bot seats
 * (reserved player_number ≥ 900000) never get progression/XP rows — mirrors Link
 * Up's bot isolation. All XP is idempotent via a unique `reference`.
 */
export interface TtPersistence {
  createMatch(room: MatchRoom): Promise<void>;
  saveRound(room: MatchRoom, round: ActiveRound, perSeat: Record<number, number>): Promise<void>;
  awardRoundXp(room: MatchRoom, xpBySeat: Map<number, number>): Promise<void>;
  markWithdrawn(matchId: string, userId: string): Promise<void>;
  finishMatch(
    room: MatchRoom,
    standings: TtStandingRow[],
    winnerUserId: string | null,
    xpForWinner: Map<number, number>,
  ): Promise<void>;
}

const isBotSeat = (s: TtSeat) => s.isBot || isBotPlayerNumber(s.playerNumber);

export class PrismaTtPersistence implements TtPersistence {
  async createMatch(room: MatchRoom): Promise<void> {
    await prisma.ttMatch.create({
      data: {
        id: room.persistId,
        kind: room.kind,
        difficulty: room.difficulty,
        roundTimerSec: room.roundTimerSec,
        roundsTotal: room.roundsTotal,
        maxPlayers: room.maxPlayers,
        status: "IN_PROGRESS",
        inviteCode: room.inviteCode,
        createdByUserId: room.createdByUserId || room.seats[0]?.userId || room.id,
        config: { isPrivate: room.isPrivate },
        startedAt: new Date(),
        players: {
          create: room.seats.map((s) => ({
            userId: s.userId,
            seat: s.seat,
            isBot: isBotSeat(s),
          })),
        },
      },
    });
  }

  async saveRound(room: MatchRoom, round: ActiveRound, perSeat: Record<number, number>): Promise<void> {
    if (!room.persisted) return; // match row never created (e.g., early failure)
    await prisma.ttRound.create({
      data: {
        matchId: room.persistId,
        roundNo: round.roundNo,
        catalogEntryId: round.entry.id,
        mode: round.state.mode,
        status: "ENDED",
        noCorrectRotations: round.state.noCorrectRotations,
        endReason: round.state.endReason,
        endedAt: new Date(),
        reveals: {
          create: round.state.reveals.map((rec) => {
            const cp = round.entry.players.find((p) => p.rank === rec.rank)!;
            const bySeatObj = rec.bySeat == null ? null : room.seats.find((s) => s.seat === rec.bySeat);
            return {
              rank: rec.rank,
              revealedByUserId: bySeatObj?.userId ?? null,
              points: rec.points,
              footballPlayerId: cp.playerId,
            };
          }),
        },
      },
    });
    // running totals on the match player rows
    for (const s of room.seats) {
      const add = perSeat[s.seat] ?? 0;
      if (add === 0) continue;
      await prisma.ttMatchPlayer.updateMany({
        where: { matchId: room.persistId, userId: s.userId },
        data: { totalPoints: { increment: add } },
      });
    }
  }

  async awardRoundXp(room: MatchRoom, xpBySeat: Map<number, number>): Promise<void> {
    if (!room.persisted) return;
    for (const [seat, xp] of xpBySeat) {
      if (xp <= 0) continue;
      const s = room.seats.find((x) => x.seat === seat);
      if (!s || isBotSeat(s)) continue; // bots never get progression/XP
      await this.applyXp(s.userId, room.persistId, xp, `${room.persistId}:${room.round?.roundNo ?? "r"}:${s.userId}:round`, "ROUND_POINTS");
    }
  }

  async markWithdrawn(matchId: string, userId: string): Promise<void> {
    await prisma.ttMatchPlayer.updateMany({
      where: { matchId, userId },
      data: { status: "WITHDRAWN", withdrawnAt: new Date(), totalPoints: 0 },
    });
  }

  async finishMatch(
    room: MatchRoom,
    _standings: TtStandingRow[],
    winnerUserId: string | null,
    xpForWinner: Map<number, number>,
  ): Promise<void> {
    if (!room.persisted) return;
    await prisma.ttMatch.update({
      where: { id: room.persistId },
      data: { status: room.status, endedAt: new Date() },
    });
    // winner bonus XP
    for (const [seat, xp] of xpForWinner) {
      const s = room.seats.find((x) => x.seat === seat);
      if (!s || isBotSeat(s)) continue;
      await this.applyXp(s.userId, room.persistId, xp, `${room.persistId}:${s.userId}:win`, "MATCH_WIN");
    }
    // matchesPlayed / matchesWon
    for (const s of room.seats) {
      if (isBotSeat(s)) continue;
      const won = winnerUserId === s.userId;
      await prisma.ttProgression.upsert({
        where: { userId: s.userId },
        create: { userId: s.userId, matchesPlayed: 1, matchesWon: won ? 1 : 0 },
        update: { matchesPlayed: { increment: 1 }, matchesWon: { increment: won ? 1 : 0 } },
      });
    }
  }

  /** Append an idempotent XP event and advance the progression read-model + level. */
  private async applyXp(userId: string, matchId: string, amount: number, reference: string, reason: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      try {
        await tx.ttXpEvent.create({ data: { userId, matchId, amount, reason, reference } });
      } catch {
        return; // duplicate reference → already applied (idempotent)
      }
      const prog = await tx.ttProgression.upsert({
        where: { userId },
        create: { userId, xp: BigInt(amount) },
        update: { xp: { increment: BigInt(amount) } },
      });
      const newLevel = levelForXp(Number(prog.xp));
      if (newLevel !== prog.level) {
        await tx.ttProgression.update({ where: { userId }, data: { level: newLevel } });
      }
    });
  }
}
