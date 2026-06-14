import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client";
import {
  applyWalletTransactionAtomic,
  getWalletBalance,
  registerUserWithWallet,
} from "../src/wallet";
import { InsufficientFundsError, UsernameTakenError } from "../src/errors";

/**
 * Wallet integrity tests (Section 18). These hit a real PostgreSQL because the
 * guarantees under test — FOR UPDATE row locking and the balance CHECK — are
 * database behavior, not application logic.
 *
 * Requires a running, migrated database (see docker-compose.yml + README).
 * Set TEST_DATABASE_URL to use a throwaway DB; otherwise DATABASE_URL is used.
 */

const createdUserIds: string[] = [];

async function freshUser() {
  const username = `t_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const user = await registerUserWithWallet({ username, passwordHash: "argon2id$test" });
  createdUserIds.push(user.id);
  return user;
}

async function ledgerSum(userId: string): Promise<bigint> {
  const agg = await prisma.walletTransaction.aggregate({
    where: { userId },
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
        "migrations with `pnpm db:deploy` before running wallet tests.\n" +
        String(err),
    );
  }
});

afterAll(async () => {
  // Clean up only the rows this suite created (cascades to wallet/stats/ledger).
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe("registration + signup bonus", () => {
  it("initializes wallet/stats and credits the 1000 signup bonus", async () => {
    const user = await freshUser();

    expect(user.balance).toBe(1000n);
    expect(user.playerNumber).toBeGreaterThanOrEqual(100001);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(1000n);
    expect(wallet.highestBalance).toBe(1000n);

    // Exactly one ledger row, of type SIGNUP_BONUS, and balance == ledger sum.
    const txs = await prisma.walletTransaction.findMany({ where: { userId: user.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("SIGNUP_BONUS");
    expect(txs[0]?.amount).toBe(1000n);
    expect(txs[0]?.balanceAfter).toBe(1000n);
    expect(await ledgerSum(user.id)).toBe(1000n);

    // UserStats initialized to zeros.
    const stats = await prisma.userStats.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.netProfitLoss).toBe(0n);
  });

  it("rejects a duplicate username", async () => {
    const user = await freshUser();
    const original = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(
      registerUserWithWallet({ username: original.username, passwordHash: "x" }),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });
});

describe("idempotency", () => {
  it("does not double-apply the same reference", async () => {
    const user = await freshUser();
    const reference = `test:idem:${user.id}`;

    const first = await applyWalletTransactionAtomic({
      userId: user.id,
      type: "BANK_CLAIM",
      amount: 500n,
      reference,
    });
    expect(first.idempotentReplay).toBe(false);
    expect(first.balance).toBe(1500n);

    const second = await applyWalletTransactionAtomic({
      userId: user.id,
      type: "BANK_CLAIM",
      amount: 500n,
      reference,
    });
    expect(second.idempotentReplay).toBe(true);
    expect(second.balance).toBe(1500n);
    expect(second.transactionId).toBe(first.transactionId);

    expect(await getWalletBalance(user.id)).toBe(1500n);
    // 2 rows total: signup bonus + one bank claim (the replay inserted nothing).
    const count = await prisma.walletTransaction.count({ where: { userId: user.id } });
    expect(count).toBe(2);
  });
});

describe("negative-balance prevention", () => {
  it("rejects a debit beyond the balance and leaves state untouched", async () => {
    const user = await freshUser();

    await expect(
      applyWalletTransactionAtomic({
        userId: user.id,
        type: "BET",
        amount: -1001n,
        reference: `test:over:${user.id}`,
      }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);

    // Balance unchanged, no extra ledger row.
    expect(await getWalletBalance(user.id)).toBe(1000n);
    const count = await prisma.walletTransaction.count({ where: { userId: user.id } });
    expect(count).toBe(1);
  });

  it("allows debiting the exact balance down to zero", async () => {
    const user = await freshUser();
    const res = await applyWalletTransactionAtomic({
      userId: user.id,
      type: "ANTE",
      amount: -1000n,
      reference: `test:exact:${user.id}`,
    });
    expect(res.balance).toBe(0n);
    expect(await getWalletBalance(user.id)).toBe(0n);
  });
});

describe("ledger / balance synchronization", () => {
  it("keeps balance == Σ(ledger) across a sequence of movements", async () => {
    const user = await freshUser();
    const moves: bigint[] = [-50n, 200n, -300n, 1000n, -25n];

    for (const [i, amount] of moves.entries()) {
      await applyWalletTransactionAtomic({
        userId: user.id,
        type: amount > 0n ? "WIN" : "BET",
        amount,
        reference: `test:seq:${user.id}:${i}`,
      });
    }

    const expected = 1000n + moves.reduce((a, b) => a + b, 0n);
    expect(await getWalletBalance(user.id)).toBe(expected);
    expect(await ledgerSum(user.id)).toBe(expected);

    // Highest balance tracked the peak (1000 -> 950 -> 1150 -> 850 -> 1850 -> 1825).
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.highestBalance).toBe(1850n);
  });
});

describe("concurrency (row locking)", () => {
  it("serializes parallel debits and never goes negative", async () => {
    const user = await freshUser(); // 1000 balance
    const debit = 200n; // 5 of these fit, the other 5 must fail
    const attempts = 10;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) =>
        applyWalletTransactionAtomic({
          userId: user.id,
          type: "BET",
          amount: -debit,
          reference: `test:conc:${user.id}:${i}`,
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    expect(succeeded).toBe(5);
    expect(failed).toBe(5);

    // Balance is exactly zero and never dipped below it.
    expect(await getWalletBalance(user.id)).toBe(0n);

    // Ledger reflects exactly the 5 successful debits (+ the signup bonus).
    const debits = await prisma.walletTransaction.count({
      where: { userId: user.id, type: "BET" },
    });
    expect(debits).toBe(5);
  });
});
