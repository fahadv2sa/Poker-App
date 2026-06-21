import {
  Prisma,
  aggregatePlayers as dbAggregatePlayers,
  applyWalletTransaction,
  getWalletBalance,
  prisma,
  recordPlayEvents as dbRecordPlayEvents,
  type TxClient,
} from "@fp/db";
import type { Settlement } from "@fp/engine";
import type {
  BetRecord,
  LedgerMovement,
  PlayEventRecord,
  RoomPersistence,
} from "./ports.js";
import type { RoomPlayer, RoomState } from "./types.js";

/**
 * PostgreSQL-backed persistence (Section 6 + Phase 3). Every method runs inside
 * ONE interactive transaction so wallet movements and the game-record writes
 * commit or roll back together. Wallet movements go through the Phase-1 wallet
 * service (`applyWalletTransaction`): SELECT … FOR UPDATE row lock, idempotency
 * by unique `reference`, balance never negative.
 */
export class PrismaRoomPersistence implements RoomPersistence {
  async getBalances(userIds: string[]): Promise<Map<string, bigint>> {
    if (userIds.length === 0) return new Map();
    const wallets = await prisma.wallet.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, balance: true },
    });
    return new Map(wallets.map((w) => [w.userId, w.balance]));
  }

  async persistDeal(state: RoomState): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { id: state.gameId },
        data: {
          status: "IN_PROGRESS",
          phase: "PREFLOP",
          startedAt: new Date(),
          dealerSeat: state.dealerSeat,
          pot: 0n,
        },
      });

      for (const p of state.players) {
        if (p.status === "WAITING" || p.status === "DISCONNECTED") continue;
        await tx.gamePlayer.upsert({
          where: { gameId_seat: { gameId: state.gameId, seat: p.seat } },
          update: {
            status: "ACTIVE",
            holeCards: p.holeCards as unknown as Prisma.InputJsonValue,
          },
          create: {
            gameId: state.gameId,
            userId: p.userId,
            seat: p.seat,
            status: "ACTIVE",
            holeCards: p.holeCards as unknown as Prisma.InputJsonValue,
          },
        });
        for (const c of p.holeCards) {
          await tx.gameCard.create({
            data: {
              gameId: state.gameId,
              cardType: "HOLE",
              ownerSeat: p.seat,
              footballPlayerId: c.playerId,
            },
          });
        }
      }

      for (let i = 0; i < state.community.length; i++) {
        await tx.gameCard.create({
          data: {
            gameId: state.gameId,
            cardType: "COMMUNITY",
            communityIndex: i,
            footballPlayerId: state.community[i]!.playerId,
          },
        });
      }
    });
  }

  async applyBetting(
    gameId: string,
    movements: LedgerMovement[],
    bets: BetRecord[],
  ): Promise<void> {
    if (movements.length === 0 && bets.length === 0) return;
    await prisma.$transaction(async (tx) => {
      for (const m of movements) {
        await applyWalletTransaction(tx, {
          userId: m.userId,
          type: m.type,
          amount: m.amount,
          reference: m.reference,
          gameId,
        });
      }
      if (bets.length > 0) {
        const seatToPlayer = await this.seatMap(tx, gameId);
        let seq = await tx.bet.count({ where: { gameId } });
        for (const b of bets) {
          const gp = seatToPlayer.get(b.seat);
          if (!gp) continue;
          await tx.bet.create({
            data: {
              gameId,
              gamePlayerId: gp.id,
              round: b.round,
              action: b.action,
              amount: b.amount,
              sequence: seq++,
            },
          });
        }
      }
    });
  }

  async persistClaim(
    gameId: string,
    player: RoomPlayer,
    claimedRankId: string | null,
    isValid: boolean,
    bestPossibleRankId: string | null,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const seatToPlayer = await this.seatMap(tx, gameId);
      const gp = seatToPlayer.get(player.seat);
      if (!gp) return;
      await tx.playerHandClaim.create({
        data: {
          gameId,
          gamePlayerId: gp.id,
          claimedHandRankId: claimedRankId,
          isValid,
          bestPossibleRankId,
        },
      });
    });
  }

  async persistResolve(
    gameId: string,
    settlements: Settlement[],
    players: RoomPlayer[],
    handNumber: number,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const seatToPlayer = await this.seatMap(tx, gameId);

      // 1) Apply settlement movements in order (REFUND precedes its paired
      //    FOLD_FORFEIT so the balance never dips negative). The reference is
      //    salted with the hand number so the same seat/type in a later hand of
      //    this room is a distinct movement, not an idempotent duplicate.
      let resolveSeq = 0;
      for (const s of settlements) {
        const gp = seatToPlayer.get(s.seat);
        if (!gp || s.amount === 0n) continue;
        await applyWalletTransaction(tx, {
          userId: gp.userId,
          type: s.type,
          amount: s.amount,
          reference: `${gameId}:h${handNumber}:resolve:${s.seat}:${s.type}:${resolveSeq++}`,
          gameId,
        });
      }

      // 2) Per-seat results + stats.
      for (const p of players) {
        if (p.committedTotal <= 0n && p.forfeit <= 0n) continue;
        const gp = seatToPlayer.get(p.seat);
        if (!gp) continue;
        const net = netForSeat(settlements, p.seat);
        const foldRefund = p.status === "FOLDED" ? p.committedTotal - p.forfeit : 0n;
        const delta = net + foldRefund - p.committedTotal;
        const balance = await getWalletBalance(gp.userId);
        const outcome = outcomeFor(p, settlements);

        await tx.gameResult.create({
          data: {
            gameId,
            gamePlayerId: gp.id,
            outcome,
            coinsDelta: delta,
            finalBalance: balance,
          },
        });

        await tx.userStats.update({
          where: { userId: gp.userId },
          data: {
            gamesPlayed: { increment: 1 },
            wins: { increment: outcome === "WIN" || outcome === "SPLIT" ? 1 : 0 },
            losses: { increment: outcome === "LOSE" ? 1 : 0 },
            folds: { increment: outcome === "FOLD" ? 1 : 0 },
            totalCoinsWon: { increment: delta > 0n ? delta : 0n },
            totalCoinsLost: { increment: delta < 0n ? -delta : 0n },
            netProfitLoss: { increment: delta },
          },
        });
      }

      await tx.game.update({
        where: { id: gameId },
        data: { status: "ENDED", phase: "ENDED", endedAt: new Date(), pot: 0n },
      });
    });
  }

  async closeGame(
    gameId: string,
    refunds: LedgerMovement[],
    _handNumber: number,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Return each contributor's still-committed stake through the ledger
      // (FOR UPDATE + idempotent reference, balance never negative) — the live
      // hand is voided, not resolved, so there is no winner and no forfeit sink.
      for (const m of refunds) {
        await applyWalletTransaction(tx, {
          userId: m.userId,
          type: m.type,
          amount: m.amount,
          reference: m.reference,
          gameId,
        });
      }
      // ABANDONED (distinct from ENDED, which marks a normally-resolved hand of a
      // still-live session) so the room is gone for good and can't be resurrected.
      await tx.game.update({
        where: { id: gameId },
        data: { status: "ABANDONED", phase: "ENDED", endedAt: new Date(), pot: 0n },
      });
    });
  }

  async recordPlayEvents(events: PlayEventRecord[]): Promise<void> {
    await dbRecordPlayEvents(
      events.map((e) => ({
        playerId: e.playerId,
        gameId: e.gameId ?? null,
        handNumber: e.handNumber,
        type: e.type,
        value: e.value ?? null,
        metadata: (e.metadata ?? null) as Prisma.InputJsonValue | null,
      })),
    );
  }

  async aggregatePlayers(userIds: string[]): Promise<void> {
    await dbAggregatePlayers(userIds);
  }

  /** seat → { gamePlayer id, userId } for the game's players. */
  private async seatMap(
    tx: TxClient,
    gameId: string,
  ): Promise<Map<number, { id: string; userId: string }>> {
    const rows = await tx.gamePlayer.findMany({
      where: { gameId },
      select: { id: true, userId: true, seat: true },
    });
    return new Map(rows.map((r) => [r.seat, { id: r.id, userId: r.userId }]));
  }
}

function netForSeat(settlements: readonly Settlement[], seat: number): bigint {
  return settlements
    .filter((m) => m.seat === seat)
    .reduce((sum, m) => sum + m.amount, 0n);
}

function outcomeFor(
  p: RoomPlayer,
  settlements: readonly Settlement[],
): "WIN" | "SPLIT" | "LOSE" | "FOLD" | "REFUND" {
  if (p.status === "FOLDED") return "FOLD";
  const mine = settlements.filter((m) => m.seat === p.seat);
  if (mine.some((m) => m.type === "SPLIT_WIN")) return "SPLIT";
  if (mine.some((m) => m.type === "WIN")) return "WIN";
  if (mine.some((m) => m.type === "REFUND")) return "REFUND";
  return "LOSE";
}
