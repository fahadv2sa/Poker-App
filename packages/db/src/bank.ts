import { BANK_CLAIM_PER_LEVEL, BANK_RESET_TZ_OFFSET_HOURS } from "@fb/shared";
import { Prisma } from "./generated/client";
import { prisma } from "./client";
import { applyWalletTransaction } from "./wallet";
import { BankLimitError } from "./errors";

/**
 * Bank top-up — level-based daily claim. A player may claim ONCE per day for
 * `level × 1000` coins (level read from PlayerMetrics at claim time). "Day" is
 * the Asia/Riyadh (UTC+3, no DST) calendar day — a consistent server rule for the
 * Riyadh user base; reset is 00:00 Riyadh. Wallet integrity (Section 6): the
 * once-per-day check, the BankClaim insert, and the credit run in ONE transaction
 * with the wallet row locked FOR UPDATE, so concurrent claims serialize and can
 * never double-claim. The credit goes through the append-only ledger
 * (applyWalletTransaction) — never a direct balance write.
 */

const TZ_OFFSET_MS = BANK_RESET_TZ_OFFSET_HOURS * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the current Asia/Riyadh calendar day (UTC+3, no DST), as a UTC instant. */
function riyadhDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + TZ_OFFSET_MS);
  const midnightShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightShifted - TZ_OFFSET_MS);
}

export interface BankStatus {
  /** Player level (drives the daily amount). */
  level: number;
  /** Today's claim amount = level × 1000. */
  amount: bigint;
  /** Whether today's (Riyadh-day) claim has already been used. */
  claimedToday: boolean;
  /** Next reset — the next Riyadh midnight, as a UTC instant. */
  nextResetAt: Date;
}

export interface BankClaimResult {
  amount: bigint;
  balance: bigint;
  level: number;
  nextResetAt: Date;
}

export interface BankClaimLogEntry {
  claimedAt: Date;
  amount: bigint;
  /** Wallet balance right after this claim; null for pre-migration rows. */
  balanceAfter: bigint | null;
  /** Player level at claim time; null for pre-migration rows. */
  level: number | null;
}

/** The player's current level (from the metrics read model); 1 if none yet. */
async function levelOf(
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const m = await client.playerMetrics.findUnique({
    where: { userId },
    select: { level: true },
  });
  return m?.level ?? 1;
}

/** Read-only bank status for a user (no mutation). */
export async function getBankStatus(userId: string, now = new Date()): Promise<BankStatus> {
  const dayStart = riyadhDayStart(now);
  const [level, claimedToday] = await Promise.all([
    levelOf(userId),
    prisma.bankClaim
      .count({ where: { userId, claimedAt: { gte: dayStart } } })
      .then((n) => n > 0),
  ]);
  return {
    level,
    amount: BANK_CLAIM_PER_LEVEL * BigInt(level),
    claimedToday,
    nextResetAt: new Date(dayStart.getTime() + DAY_MS),
  };
}

/** Per-user claim history (most recent first). Fails soft to [] so the page
 *  renders even if the log columns aren't present yet (pre-migration). */
export async function getBankHistory(userId: string, limit = 20): Promise<BankClaimLogEntry[]> {
  try {
    return await prisma.bankClaim.findMany({
      where: { userId },
      orderBy: { claimedAt: "desc" },
      take: limit,
      select: { claimedAt: true, amount: true, balanceAfter: true, level: true },
    });
  } catch {
    return [];
  }
}

export async function claimFromBank(
  userId: string,
  now = new Date(),
): Promise<BankClaimResult> {
  const dayStart = riyadhDayStart(now);
  const nextResetAt = new Date(dayStart.getTime() + DAY_MS);
  return prisma.$transaction(async (tx) => {
    // 1) Serialize concurrent claims for this user (lock the wallet row).
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM link_up.wallets WHERE user_id = ${userId}::uuid FOR UPDATE`,
    );

    // 2) Once per Riyadh day — race-free inside the lock.
    const usedToday = await tx.bankClaim.count({
      where: { userId, claimedAt: { gte: dayStart } },
    });
    if (usedToday > 0) throw new BankLimitError(nextResetAt);

    // 3) Amount = level × 1000 (level read at claim time, server-authoritative).
    const level = await levelOf(userId, tx);
    const amount = BANK_CLAIM_PER_LEVEL * BigInt(level);

    // 4) Record the claim (id needed for the idempotency ref), credit through the
    //    ledger, then store the resulting balance on the claim for the history.
    const claim = await tx.bankClaim.create({
      data: { userId, amount, level },
      select: { id: true },
    });
    const { balance } = await applyWalletTransaction(tx, {
      userId,
      type: "BANK_CLAIM",
      amount,
      reference: `bank:${claim.id}`,
    });
    await tx.bankClaim.update({ where: { id: claim.id }, data: { balanceAfter: balance } });

    return { amount, balance, level, nextResetAt };
  });
}
