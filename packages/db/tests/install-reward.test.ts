import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client";
import { grantInstallReward } from "../src/install-reward";
import { registerUserWithWallet } from "../src/wallet";

/**
 * One-time install reward integrity: 10,000 coins granted at most once per
 * account, on the append-only ledger, holding under concurrency. Hits a real
 * PostgreSQL because the guarantee is the FOR UPDATE row lock + the per-account
 * flag that serialize concurrent claims.
 */

const createdUserIds: string[] = [];

async function freshUser() {
  const username = `ir_${randomUUID().replace(/-/g, "").slice(0, 15)}`;
  const user = await registerUserWithWallet({ username, email: `${username}@test.local`, passwordHash: "argon2id$test" });
  createdUserIds.push(user.id);
  return user;
}
async function balanceOf(userId: string): Promise<bigint> {
  return (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;
}
async function rewardRows(userId: string): Promise<number> {
  return prisma.walletTransaction.count({ where: { userId, type: "INSTALL_REWARD" } });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      "Cannot reach the database. Start it with `docker compose up -d` and apply " +
        "migrations with `pnpm db:deploy` before running these tests.",
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

describe("install reward — once per account", () => {
  it("grants 10,000 once, then never again", async () => {
    const user = await freshUser();
    expect(await balanceOf(user.id)).toBe(1000n);

    const first = await grantInstallReward(user.id);
    expect(first.granted).toBe(true);
    expect(first.amount).toBe(10000n);
    expect(first.balance).toBe(11000n); // 1000 signup + 10000

    const second = await grantInstallReward(user.id);
    expect(second.granted).toBe(false);
    expect(second.amount).toBe(0n);
    expect(second.balance).toBe(11000n);

    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { installRewardAt: true },
    });
    expect(u?.installRewardAt).not.toBeNull();
    expect(await balanceOf(user.id)).toBe(11000n);
    expect(await rewardRows(user.id)).toBe(1);
  });

  it("serializes concurrent grants so only one credits", async () => {
    const user = await freshUser();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => grantInstallReward(user.id)),
    );
    const grantedCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.granted,
    ).length;

    expect(grantedCount).toBe(1);
    expect(await balanceOf(user.id)).toBe(11000n);
    expect(await rewardRows(user.id)).toBe(1);
  });
});
