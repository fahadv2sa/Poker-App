import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, registerUserWithWallet } from "@fb/db";
import { PERMISSIONS } from "@fb/shared";
import { bootstrapSuperAdmin } from "../src/bootstrap.js";
import { loadAdminContext } from "../src/context.js";
import { can } from "../src/authz.js";

/**
 * Admin bootstrap + authority integration tests. Hit a real PostgreSQL because
 * the guarantees under test (unique admin row, idempotent re-run, audit append)
 * are database behavior. Requires a running, migrated DB (docker-compose + the
 * add_admin_authority migration). Set TEST_DATABASE_URL for a throwaway DB.
 */

const createdUserIds: string[] = [];

async function freshUser() {
  const username = `adm_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const user = await registerUserWithWallet({
    username,
    email: `${username}@test.local`,
    passwordHash: "argon2id$test",
  });
  createdUserIds.push(user.id);
  return { id: user.id, username, email: `${username}@test.local` };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      "Cannot reach the database. Start it with `docker compose up -d` and apply " +
        "migrations (`pnpm db:deploy`) before running admin-core tests.",
      { cause: err },
    );
  }
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // audit rows have no FK to users — remove them explicitly; deleting the user
    // cascades its admin + permission rows.
    await prisma.adminAuditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe("bootstrapSuperAdmin", () => {
  it("creates exactly one SUPER_ADMIN and is idempotent on re-run", async () => {
    const user = await freshUser();

    const first = await bootstrapSuperAdmin({ username: user.username });
    expect(first.created).toBe(true);
    expect(first.alreadySuperAdmin).toBe(false);
    expect(first.userId).toBe(user.id);

    // re-run (resolved by email this time) is a no-op
    const second = await bootstrapSuperAdmin({ email: user.email });
    expect(second.created).toBe(false);
    expect(second.promoted).toBe(false);
    expect(second.alreadySuperAdmin).toBe(true);

    // exactly one admin row exists
    expect(await prisma.admin.count({ where: { userId: user.id } })).toBe(1);

    // context loads as super-admin and passes can() for any permission
    const ctx = await loadAdminContext(user.id);
    expect(ctx?.role).toBe("SUPER_ADMIN");
    expect(can(ctx, PERMISSIONS.USERS_DELETE)).toBe(true);
    expect(can(ctx, PERMISSIONS.COINS_ADJUST)).toBe(true);

    // exactly one audit row was recorded for the bootstrap
    expect(
      await prisma.adminAuditLog.count({
        where: { actorUserId: user.id, action: "admin.bootstrap_super_admin" },
      }),
    ).toBe(1);
  });

  it("throws if the account does not exist", async () => {
    await expect(
      bootstrapSuperAdmin({ username: `nope_${randomUUID().slice(0, 8)}` }),
    ).rejects.toThrow(/no user found/);
  });
});
