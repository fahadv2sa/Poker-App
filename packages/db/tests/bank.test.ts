import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client";
import { claimFromBank, getBankStatus } from "../src/bank";
import { registerUserWithWallet } from "../src/wallet";
import { BankLimitError } from "../src/errors";

/**
 * Bank top-up integrity (Section 1/13/18): 1000 Coins, max 2× per rolling 24h,
 * every credit on the append-only ledger, the limit holding under concurrency.
 * Hits a real PostgreSQL because the guarantee under test is the FOR UPDATE row
 * lock that serializes concurrent claims.
 */

const createdUserIds: string[] = [];

async function freshUser() {
  const username = `bk_${randomUUID().replace(/-/g, "").slice(0, 15)}`;
  const user = await registerUserWithWallet({ username, passwordHash: "argon2id$test" });
  createdUserIds.push(user.id);
  return user;
}

async function balanceOf(userId: string): Promise<bigint> {
  return (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;
}
async function claimCount(userId: string): Promise<number> {
  return prisma.bankClaim.count({ where: { userId } });
}
async function bankCreditedSum(userId: string): Promise<bigint> {
  const agg = await prisma.walletTransaction.aggregate({
    where: { userId, type: "BANK_CLAIM" },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0n;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      "Cannot reach the database. Start it with `docker compose up -d` and apply " +
        "migrations with `pnpm db:deploy` before running bank tests.",
      { cause: err },
    );
  }
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe("bank claim — 2× / 24h limit", () => {
  it("allows exactly two 1000-coin claims, then blocks the third", async () => {
    const user = await freshUser();
    expect(await balanceOf(user.id)).toBe(1000n);

    const first = await claimFromBank(user.id);
    expect(first.amount).toBe(1000n);
    expect(first.balance).toBe(2000n);
    expect(first.remaining).toBe(1);

    const second = await claimFromBank(user.id);
    expect(second.balance).toBe(3000n);
    expect(second.remaining).toBe(0);

    await expect(claimFromBank(user.id)).rejects.toBeInstanceOf(BankLimitError);

    // No third credit: balance, claim rows, and ledger all show exactly two.
    expect(await balanceOf(user.id)).toBe(3000n);
    expect(await claimCount(user.id)).toBe(2);
    expect(await bankCreditedSum(user.id)).toBe(2000n);
  });

  it("does not count claims older than the 24h window (rolling)", async () => {
    const user = await freshUser();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.bankClaim.createMany({
      data: [
        { userId: user.id, amount: 1000n, claimedAt: old },
        { userId: user.id, amount: 1000n, claimedAt: old },
      ],
    });

    const status = await getBankStatus(user.id);
    expect(status.claimsInWindow).toBe(0);
    expect(status.remaining).toBe(2);

    // A fresh claim is allowed despite two (expired) claims on record.
    const res = await claimFromBank(user.id);
    expect(res.remaining).toBe(1);
    expect(await balanceOf(user.id)).toBe(2000n);
  });

  it("serializes concurrent claims so the limit can't be exceeded", async () => {
    const user = await freshUser();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => claimFromBank(user.id)),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    expect(rejected.every((r) => r.reason instanceof BankLimitError)).toBe(true);

    // Exactly two credits of 1000 — never more, even under the race.
    expect(await balanceOf(user.id)).toBe(3000n);
    expect(await claimCount(user.id)).toBe(2);
    expect(await bankCreditedSum(user.id)).toBe(2000n);
  });

  it("keeps balance equal to the ledger sum after a claim", async () => {
    const user = await freshUser();
    await claimFromBank(user.id);
    const agg = await prisma.walletTransaction.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
    });
    expect(await balanceOf(user.id)).toBe(agg._sum.amount ?? 0n); // 1000 signup + 1000 bank
  });
});
