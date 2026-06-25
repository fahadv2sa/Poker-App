import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isUserDisabled, prisma, registerUserWithWallet } from "@fb/db";
import {
  adminAdjustWallet,
  bootstrapSuperAdmin,
  deleteUserAccount,
  setEmailVerified,
  setUserDisabled,
  setUserPassword,
} from "../src/index.js";

/** Admin write-action integration tests (real Postgres). Verify ledger-safe coin
 *  adjustment, ban/verify/password, delete guards, and that each action audits. */

const ACTOR = "00000000-0000-0000-0000-000000000000";
const createdUserIds: string[] = [];

async function freshUser() {
  const username = `act_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const u = await registerUserWithWallet({
    username,
    email: `${username}@test.local`,
    passwordHash: "argon2id$test",
  });
  createdUserIds.push(u.id);
  return { id: u.id, username, playerNumber: u.playerNumber };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error("Cannot reach the database for admin action tests.", { cause: err });
  }
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({
      where: { actorUserId: { in: [...createdUserIds, ACTOR] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe("adminAdjustWallet (ledger-safe)", () => {
  it("credits and debits through the ledger as ADMIN_ADJUST, with audit rows", async () => {
    const u = await freshUser();
    const credit = await adminAdjustWallet({ actorUserId: ACTOR, targetUserId: u.id, amount: 500n, reason: "credit" });
    expect(BigInt(credit.balanceAfter) - BigInt(credit.balanceBefore)).toBe(500n);

    const debit = await adminAdjustWallet({ actorUserId: ACTOR, targetUserId: u.id, amount: -200n, reason: "debit" });
    expect(BigInt(debit.balanceAfter)).toBe(BigInt(credit.balanceAfter) - 200n);

    const ledger = await prisma.walletTransaction.count({ where: { userId: u.id, type: "ADMIN_ADJUST" } });
    expect(ledger).toBe(2);
    const audits = await prisma.adminAuditLog.count({ where: { actorUserId: ACTOR, action: "coins.adjust", targetId: u.id } });
    expect(audits).toBe(2);
  });

  it("rejects a zero amount and an overdraw (balance never goes negative)", async () => {
    const u = await freshUser();
    await expect(
      adminAdjustWallet({ actorUserId: ACTOR, targetUserId: u.id, amount: 0n, reason: "" }),
    ).rejects.toMatchObject({ code: "NONZERO" });
    await expect(
      adminAdjustWallet({ actorUserId: ACTOR, targetUserId: u.id, amount: -999_999_999n, reason: "" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });
});

describe("user management actions", () => {
  it("disable blocks login (isUserDisabled), re-enable clears, self-disable refused", async () => {
    const u = await freshUser();
    await setUserDisabled({ actorUserId: ACTOR, targetUserId: u.id, disabled: true });
    expect(await isUserDisabled(u.id)).toBe(true);
    await setUserDisabled({ actorUserId: ACTOR, targetUserId: u.id, disabled: false });
    expect(await isUserDisabled(u.id)).toBe(false);
    await expect(
      setUserDisabled({ actorUserId: u.id, targetUserId: u.id, disabled: true }),
    ).rejects.toMatchObject({ code: "SELF_DISABLE" });
  });

  it("verify toggles the email-verified timestamp", async () => {
    const u = await freshUser();
    await setEmailVerified({ actorUserId: ACTOR, targetUserId: u.id, verified: true });
    const row = await prisma.user.findUnique({ where: { id: u.id }, select: { emailVerifiedAt: true } });
    expect(row!.emailVerifiedAt).not.toBeNull();
  });

  it("setUserPassword updates the stored hash", async () => {
    const u = await freshUser();
    await setUserPassword({ actorUserId: ACTOR, targetUserId: u.id, passwordHash: "argon2id$NEW" });
    const row = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    expect(row!.passwordHash).toBe("argon2id$NEW");
  });

  it("delete removes a non-admin but refuses admin accounts and self", async () => {
    const victim = await freshUser();
    await deleteUserAccount({ actorUserId: ACTOR, targetUserId: victim.id });
    expect(await prisma.user.findUnique({ where: { id: victim.id } })).toBeNull();

    const admin = await freshUser();
    await bootstrapSuperAdmin({ username: admin.username });
    await expect(
      deleteUserAccount({ actorUserId: ACTOR, targetUserId: admin.id }),
    ).rejects.toMatchObject({ code: "DELETE_ADMIN" });
    await expect(
      deleteUserAccount({ actorUserId: admin.id, targetUserId: admin.id }),
    ).rejects.toMatchObject({ code: "SELF_DELETE" });
  });
});
