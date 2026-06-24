import {
  BADGE_CATALOG,
  computeXp,
  deriveMetricView,
  evaluateBadgeRule,
  levelForXp,
  parseBadgeRule,
  type MetricCounters,
  type PlayEventType,
} from "@fb/shared";
import { Prisma } from "./generated/client";
import { prisma } from "./client";

/**
 * Statistics & progression aggregation (Layers 2-4). Runs AFTER a hand, never in
 * the betting hot path. Incremental + idempotent: each player has a `last_seq`
 * watermark, and only ROUND_SUMMARY events beyond it are folded in — so a replay
 * or a re-run is a no-op. Reads nothing the live game depends on.
 */

export interface PlayEventInput {
  playerId: string;
  gameId?: string | null;
  handNumber: number;
  type: PlayEventType;
  value?: number | null;
  metadata?: Prisma.InputJsonValue | null;
}

/** Append a batch of raw events (Layer 1). Append-only; never updated. */
export async function recordPlayEvents(events: PlayEventInput[]): Promise<void> {
  if (events.length === 0) return;
  await prisma.playEvent.createMany({
    data: events.map((e) => ({
      playerId: e.playerId,
      gameId: e.gameId ?? null,
      handNumber: e.handNumber,
      type: e.type,
      value: e.value ?? null,
      metadata: e.metadata ?? Prisma.JsonNull,
    })),
  });
}

/** The per-hand ROUND_SUMMARY metadata the game-server writes (mirrors here). */
interface RoundSummaryMeta {
  outcome?: string;
  folded?: boolean;
  showdown?: boolean;
  luck?: number;
  betToPotSum?: number;
  betActionCount?: number;
  isBluff?: boolean;
  bluffWon?: boolean;
  weakWon?: boolean;
  pot?: number;
}

const n = (b: bigint) => Number(b);

/**
 * Fold every new ROUND_SUMMARY event for one player into their metrics, award any
 * newly-earned badges, and recompute XP/level — all in one locked transaction.
 */
export async function aggregatePlayer(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const m =
      (await tx.playerMetrics.findUnique({ where: { userId } })) ??
      (await tx.playerMetrics.create({ data: { userId } }));

    const events = await tx.playEvent.findMany({
      where: { playerId: userId, type: "ROUND_SUMMARY", seq: { gt: m.lastSeq } },
      orderBy: { seq: "asc" },
    });
    if (events.length === 0) return;

    const c: MetricCounters = {
      matches: m.matches,
      wins: m.wins,
      losses: m.losses,
      folds: m.folds,
      netProfit: n(m.netProfit),
      showdownCount: m.showdownCount,
      bluffCount: m.bluffCount,
      bluffSuccessCount: m.bluffSuccessCount,
      weakWonCount: m.weakWonCount,
      betToPotSum: m.betToPotSum,
      betActionCount: m.betActionCount,
      luckSum: m.luckSum,
      luckRounds: m.luckRounds,
      biggestPot: n(m.biggestPot),
      longestWinStreak: m.longestWinStreak,
    };
    let totalWon = n(m.totalWon);
    let totalLost = n(m.totalLost);
    let biggestWin = n(m.biggestWin);
    let biggestLoss = n(m.biggestLoss);
    let currentStreak = m.currentWinStreak;
    let lastSeq = m.lastSeq;

    for (const e of events) {
      const md = (e.metadata ?? {}) as RoundSummaryMeta;
      const delta = e.value ?? 0;
      const won = md.outcome === "WIN" || md.outcome === "SPLIT";

      c.matches += 1;
      if (won) c.wins += 1;
      else if (md.outcome === "LOSE") c.losses += 1;
      if (md.folded) c.folds += 1;

      c.netProfit += delta;
      if (delta > 0) {
        totalWon += delta;
        if (delta > biggestWin) biggestWin = delta; // biggest single-hand win
      } else if (delta < 0) {
        totalLost += -delta;
        if (-delta > biggestLoss) biggestLoss = -delta; // biggest single-hand loss
      }

      if (md.showdown) c.showdownCount += 1;
      if (md.isBluff) c.bluffCount += 1;
      if (md.bluffWon) c.bluffSuccessCount += 1;
      if (md.weakWon) c.weakWonCount += 1;

      c.betToPotSum += md.betToPotSum ?? 0;
      c.betActionCount += md.betActionCount ?? 0;
      c.luckSum += md.luck ?? 0;
      c.luckRounds += 1;
      c.biggestPot = Math.max(c.biggestPot, md.pot ?? 0);

      if (won) currentStreak += 1;
      else currentStreak = 0;
      c.longestWinStreak = Math.max(c.longestWinStreak, currentStreak);

      lastSeq = e.seq;
    }

    // Layer 3 — award newly-earned badges (idempotent via the unique constraint).
    const view = deriveMetricView(c);
    const badges = await tx.badge.findMany({ where: { active: true } });
    const owned = new Set(
      (await tx.playerBadge.findMany({ where: { userId }, select: { badgeId: true } })).map(
        (b) => b.badgeId,
      ),
    );
    for (const b of badges) {
      if (owned.has(b.id)) continue;
      if (evaluateBadgeRule(parseBadgeRule(b.rule), view)) {
        await tx.playerBadge.create({ data: { userId, badgeId: b.id } });
        owned.add(b.id);
      }
    }

    // Layer 4 — composite XP/level.
    const xp = computeXp(view, owned.size);
    const level = levelForXp(xp);

    await tx.playerMetrics.update({
      where: { userId },
      data: {
        matches: c.matches,
        wins: c.wins,
        losses: c.losses,
        folds: c.folds,
        netProfit: BigInt(Math.round(c.netProfit)),
        totalWon: BigInt(Math.round(totalWon)),
        totalLost: BigInt(Math.round(totalLost)),
        biggestWin: BigInt(Math.round(biggestWin)),
        biggestLoss: BigInt(Math.round(biggestLoss)),
        showdownCount: c.showdownCount,
        bluffCount: c.bluffCount,
        bluffSuccessCount: c.bluffSuccessCount,
        weakWonCount: c.weakWonCount,
        betToPotSum: c.betToPotSum,
        betActionCount: c.betActionCount,
        luckSum: c.luckSum,
        luckRounds: c.luckRounds,
        biggestPot: BigInt(Math.round(c.biggestPot)),
        currentWinStreak: currentStreak,
        longestWinStreak: c.longestWinStreak,
        xp: BigInt(xp),
        level,
        lastSeq,
      },
    });
  });
}

/** Aggregate several players (the participants of a just-resolved hand). */
export async function aggregatePlayers(userIds: string[]): Promise<void> {
  for (const id of [...new Set(userIds)]) await aggregatePlayer(id);
}

/**
 * Mark the player's current level as celebrated — consumes the level-up modal
 * (server-authoritative, once per level-up). Advances `celebrated_level` to the
 * current `level` in one statement; idempotent and a no-op if already caught up.
 */
export async function acknowledgeLevelUp(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE link_up.player_metrics SET celebrated_level = level WHERE user_id = ${userId}::uuid
  `;
}

// Re-export the badge seed list so the seed script + UI share one source.
export { BADGE_CATALOG };
