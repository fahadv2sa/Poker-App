import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client";
import { claimFromBank, getBankHistory, getBankStatus } from "../src/bank";
import { registerUserWithWallet } from "../src/wallet";
import { BankLimitError } from "../src/errors";

/**
 * Bank top-up integrity: level-based daily claim (level × 1000), ONCE per Riyadh
 * day, every credit on the append-only ledger, the once-per-day rule holding
 * under concurrency, and the claim log persisting. Hits a real PostgreSQL because
 * the guarantee under test is the FOR UPDATE row lock that serializes claims.
 */

const createdUserIds: string[] = [];

async function freshUser(level?: number) {
  const username = `bk_${randomUUID().replace(/-/g, "").slice(0, 15)}`;
  const user = await registerUserWithWallet({ username, email: `${username}@test.local`, passwordHash: "argon2id$test" });
  createdUserIds.push(user.id);
  if (level != null) {
    await prisma.playerMetrics.upsert({
      where: { userId: user.id },
      create: { userId: user.id, level },
      update: { level },
    });
  }
  return user;
}

async function balanceOf(userId: string): Promise<bigint> {
  return (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;
}
async function claimCount(userId: string): Promise<number> {
  return prisma.bankClaim.count({ where: { userId } });
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

describe("bank claim — level-based daily", () => {
  it("claims level × 1000 once, then blocks the same day", async () => {
    const user = await freshUser(); // default level 1
    expect(await balanceOf(user.id)).toBe(1000n);

    const status0 = await getBankStatus(user.id);
    expect(status0.level).toBe(1);
    expect(status0.amount).toBe(1000n);
    expect(status0.claimedToday).toBe(false);

    const res = await claimFromBank(user.id);
    expect(res.amount).toBe(1000n);
    expect(res.balance).toBe(2000n);
    expect(res.level).toBe(1);

    // Second claim the same day is blocked.
    await expect(claimFromBank(user.id)).rejects.toBeInstanceOf(BankLimitError);
    expect(await balanceOf(user.id)).toBe(2000n);
    expect(await claimCount(user.id)).toBe(1);
    expect((await getBankStatus(user.id)).claimedToday).toBe(true);
  });

  it("scales the amount with the player's level (level × 1000)", async () => {
    const user = await freshUser(3);
    const status = await getBankStatus(user.id);
    expect(status.level).toBe(3);
    expect(status.amount).toBe(3000n);

    const res = await claimFromBank(user.id);
    expect(res.amount).toBe(3000n);
    expect(res.level).toBe(3);
    expect(await balanceOf(user.id)).toBe(4000n); // 1000 signup + 3000
  });

  it("a claim from a previous Riyadh day does not block today", async () => {
    const user = await freshUser();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await prisma.bankClaim.create({
      data: { userId: user.id, amount: 1000n, claimedAt: twoDaysAgo },
    });

    expect((await getBankStatus(user.id)).claimedToday).toBe(false);
    const res = await claimFromBank(user.id);
    expect(res.balance).toBe(2000n);
  });

  it("serializes concurrent claims so only one succeeds per day", async () => {
    const user = await freshUser();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => claimFromBank(user.id)),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    expect(rejected.every((r) => r.reason instanceof BankLimitError)).toBe(true);

    expect(await balanceOf(user.id)).toBe(2000n); // 1000 signup + one 1000 claim
    expect(await claimCount(user.id)).toBe(1);
  });

  it("persists the claim log and keeps balance = ledger sum", async () => {
    const user = await freshUser(2);
    await claimFromBank(user.id);

    const history = await getBankHistory(user.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.amount).toBe(2000n);
    expect(history[0]!.level).toBe(2);
    expect(history[0]!.balanceAfter).toBe(3000n); // 1000 signup + 2000

    const agg = await prisma.walletTransaction.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
    });
    expect(await balanceOf(user.id)).toBe(agg._sum.amount ?? 0n);
  });
});
