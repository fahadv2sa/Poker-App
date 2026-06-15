import {
  BANK_CLAIM_AMOUNT,
  BANK_CLAIM_MAX_PER_WINDOW,
  BANK_CLAIM_WINDOW_HOURS,
} from "@fp/shared";
import { Prisma } from "./generated/client";
import { prisma } from "./client";
import { applyWalletTransaction } from "./wallet";
import { BankLimitError } from "./errors";

/**
 * Bank top-up (Section 1 / 13): credit 1000 Coins, at most twice per rolling
 * 24h. Wallet integrity (Section 6): the count check, the BankClaim insert, and
 * the credit all run in ONE transaction; the wallet row is locked FOR UPDATE
 * first so concurrent claims for the same user serialize and can never exceed
 * the limit. The credit goes through the append-only ledger
 * (applyWalletTransaction) — never a direct balance write.
 */

const WINDOW_MS = BANK_CLAIM_WINDOW_HOURS * 60 * 60 * 1000;

export interface BankStatus {
  /** Claims made in the current rolling window. */
  claimsInWindow: number;
  /** Claims still available in the window. */
  remaining: number;
  /** When a used slot frees up (oldest claim + 24h), or null if none used. */
  nextResetAt: Date | null;
}

export interface BankClaimResult extends BankStatus {
  amount: bigint;
  balance: bigint;
}

/** Read-only bank status for a user (no mutation). */
export async function getBankStatus(userId: string, now = new Date()): Promise<BankStatus> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const claims = await prisma.bankClaim.findMany({
    where: { userId, claimedAt: { gte: since } },
    orderBy: { claimedAt: "asc" },
    select: { claimedAt: true },
  });
  return statusFrom(claims.map((c) => c.claimedAt));
}

export async function claimFromBank(
  userId: string,
  now = new Date(),
): Promise<BankClaimResult> {
  return prisma.$transaction(async (tx) => {
    // 1) Serialize concurrent claims for this user (lock the wallet row).
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`,
    );

    // 2) Count claims in the rolling window — race-free inside the lock.
    const since = new Date(now.getTime() - WINDOW_MS);
    const recent = await tx.bankClaim.findMany({
      where: { userId, claimedAt: { gte: since } },
      orderBy: { claimedAt: "asc" },
      select: { claimedAt: true },
    });
    if (recent.length >= BANK_CLAIM_MAX_PER_WINDOW) {
      throw new BankLimitError(new Date(recent[0]!.claimedAt.getTime() + WINDOW_MS));
    }

    // 3) Record the claim and credit through the ledger (idempotent reference).
    const claim = await tx.bankClaim.create({
      data: { userId, amount: BANK_CLAIM_AMOUNT },
      select: { id: true, claimedAt: true },
    });
    const { balance } = await applyWalletTransaction(tx, {
      userId,
      type: "BANK_CLAIM",
      amount: BANK_CLAIM_AMOUNT,
      reference: `bank:${claim.id}`,
    });

    const status = statusFrom([...recent.map((c) => c.claimedAt), claim.claimedAt]);
    return { ...status, amount: BANK_CLAIM_AMOUNT, balance };
  });
}

function statusFrom(claimTimes: Date[]): BankStatus {
  const used = claimTimes.length;
  const oldest = claimTimes[0] ?? null;
  return {
    claimsInWindow: used,
    remaining: Math.max(0, BANK_CLAIM_MAX_PER_WINDOW - used),
    nextResetAt: oldest ? new Date(oldest.getTime() + WINDOW_MS) : null,
  };
}
