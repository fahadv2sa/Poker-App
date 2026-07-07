import { prisma } from "@fb/db";
import { gpLevelForXp } from "@fb/guess-player-engine";
import type { GpAnswerView } from "@fb/shared";
import type { ActiveGpRound, GpMatchRoom } from "./types.js";

/**
 * Persistence for Guess the Player — writes ONLY to the `guess_player`
 * schema. Never touches football.* (read through the facts seam) or any
 * other game's tables. Questions and guesses are appended LIVE (audit
 * trail — approved); XP is idempotent via a unique `reference`.
 */
export interface GpPersistence {
  createMatch(room: GpMatchRoom): Promise<void>;
  createRound(
    room: GpMatchRoom,
    roundNo: number,
    hiddenPlayerId: string,
    pickerUserId: string | null,
  ): Promise<string | null>;
  saveQuestion(
    roundId: string | null,
    turnNo: number,
    askerUserId: string,
    template: string,
    params: Record<string, string | number>,
    answer: GpAnswerView,
  ): Promise<void>;
  saveGuess(
    roundId: string | null,
    guesserUserId: string,
    footballPlayerId: string,
    correct: boolean,
    attemptNo: number,
  ): Promise<void>;
  finishRound(
    room: GpMatchRoom,
    round: ActiveGpRound,
    endReason: "CORRECT_GUESS" | "TIMER" | "ALL_EXHAUSTED" | "REVEAL_VOTE" | "ABANDONED",
    winnerUserId: string | null,
    winnerPoints: number,
  ): Promise<void>;
  awardXp(
    userId: string,
    matchId: string,
    amount: number,
    reference: string,
    reason: string,
  ): Promise<void>;
  markWithdrawn(matchId: string, userId: string): Promise<void>;
  finishMatch(room: GpMatchRoom, winnerUserId: string | null): Promise<void>;
}

export class PrismaGpPersistence implements GpPersistence {
  async createMatch(room: GpMatchRoom): Promise<void> {
    await prisma.gpMatch.create({
      data: {
        id: room.persistId,
        kind: room.kind,
        mode: room.mode,
        difficulty: room.difficulty,
        // Open-ended sessions: rounds_total is REPURPOSED — written at close
        // with the number of rounds the session contained (analytics only).
        roundTimerSec: room.roundTimerSec,
        turnTimerSec: room.turnTimerSec,
        maxPlayers: room.maxPlayers,
        status: "IN_PROGRESS",
        inviteCode: room.inviteCode,
        isPrivate: room.isPrivate,
        roomName: room.roomName,
        createdByUserId: room.createdByUserId || room.seats[0]?.userId || room.id,
        config: {},
        startedAt: new Date(),
        players: {
          create: room.seats.map((s) => ({ userId: s.userId, seat: s.seat })),
        },
      },
    });
  }

  async createRound(
    room: GpMatchRoom,
    roundNo: number,
    hiddenPlayerId: string,
    pickerUserId: string | null,
  ): Promise<string | null> {
    if (!room.persisted) return null;
    const row = await prisma.gpRound.create({
      data: { matchId: room.persistId, roundNo, hiddenPlayerId, pickerUserId },
      select: { id: true },
    });
    return row.id;
  }

  async saveQuestion(
    roundId: string | null,
    turnNo: number,
    askerUserId: string,
    template: string,
    params: Record<string, string | number>,
    answer: GpAnswerView,
  ): Promise<void> {
    if (!roundId) return;
    await prisma.gpQuestion.create({
      data: {
        roundId,
        turnNo,
        askerUserId,
        template: template as never,
        params,
        answer,
      },
    });
  }

  async saveGuess(
    roundId: string | null,
    guesserUserId: string,
    footballPlayerId: string,
    correct: boolean,
    attemptNo: number,
  ): Promise<void> {
    if (!roundId) return;
    await prisma.gpGuess.create({
      data: { roundId, guesserUserId, footballPlayerId, correct, attemptNo },
    });
  }

  async finishRound(
    room: GpMatchRoom,
    round: ActiveGpRound,
    endReason: "CORRECT_GUESS" | "TIMER" | "ALL_EXHAUSTED" | "REVEAL_VOTE" | "ABANDONED",
    winnerUserId: string | null,
    winnerPoints: number,
  ): Promise<void> {
    if (!round.persistRoundId) return;
    await prisma.gpRound.update({
      where: { id: round.persistRoundId },
      data: { status: "ENDED", endReason, winnerUserId, winnerPoints, endedAt: new Date() },
    });
    if (winnerUserId) {
      await prisma.gpMatchPlayer.updateMany({
        where: { matchId: room.persistId, userId: winnerUserId },
        data: { totalPoints: { increment: winnerPoints } },
      });
      await prisma.gpProgression.upsert({
        where: { userId: winnerUserId },
        create: { userId: winnerUserId, roundsWon: 1 },
        update: { roundsWon: { increment: 1 } },
      });
    }
  }

  async awardXp(
    userId: string,
    matchId: string,
    amount: number,
    reference: string,
    reason: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await prisma.$transaction(async (tx) => {
      try {
        await tx.gpXpEvent.create({ data: { userId, matchId, amount, reason, reference } });
      } catch {
        return; // duplicate reference → already applied (idempotent)
      }
      const prog = await tx.gpProgression.upsert({
        where: { userId },
        create: { userId, xp: BigInt(amount) },
        update: { xp: { increment: BigInt(amount) } },
      });
      const newLevel = gpLevelForXp(Number(prog.xp));
      if (newLevel !== prog.level) {
        await tx.gpProgression.update({ where: { userId }, data: { level: newLevel } });
      }
    });
  }

  async markWithdrawn(matchId: string, userId: string): Promise<void> {
    await prisma.gpMatchPlayer.updateMany({
      where: { matchId, userId },
      data: { status: "WITHDRAWN", withdrawnAt: new Date(), totalPoints: 0 },
    });
  }

  async finishMatch(room: GpMatchRoom, winnerUserId: string | null): Promise<void> {
    if (!room.persisted) return;
    await prisma.gpMatch.update({
      where: { id: room.persistId },
      data: { status: room.status, endedAt: new Date(), roundsTotal: room.roundsPlayed },
    });
    for (const s of room.seats) {
      const won = winnerUserId === s.userId;
      await prisma.gpProgression.upsert({
        where: { userId: s.userId },
        create: { userId: s.userId, matchesPlayed: 1, matchesWon: won ? 1 : 0 },
        update: { matchesPlayed: { increment: 1 }, matchesWon: { increment: won ? 1 : 0 } },
      });
    }
  }
}
