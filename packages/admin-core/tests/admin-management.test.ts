import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, registerUserWithWallet } from "@fb/db";
import { PERMISSIONS } from "@fb/shared";
import {
  bootstrapSuperAdmin,
  can,
  getManagedAdmin,
  grantPermission,
  loadAdminContext,
  removeAdmin,
  revokePermission,
  setAdmin,
} from "../src/index.js";

/** Two-tier admin management + anti-lockout (real Postgres). The admin tables are
 *  wiped before this file and after each test so the global super-count guards are
 *  deterministic. */

let createdUserIds: string[] = [];

async function freshUser() {
  const username = `adm_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
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
    throw new Error("Cannot reach the database for admin-management tests.", { cause: err });
  }
  await prisma.adminPermission.deleteMany({});
  await prisma.admin.deleteMany({});
});

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }); // cascades admins
    createdUserIds = [];
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("admin management", () => {
  it("super appoints an ADMIN and grants/revokes a permission; context reflects it", async () => {
    const su = await freshUser();
    await bootstrapSuperAdmin({ username: su.username });
    const admin = await freshUser();

    await setAdmin({ actorUserId: su.id, targetUserId: admin.id, role: "ADMIN" });
    let ctx = await loadAdminContext(admin.id);
    expect(ctx?.role).toBe("ADMIN");
    expect(can(ctx, PERMISSIONS.USERS_READ)).toBe(false);

    await grantPermission({ actorUserId: su.id, targetUserId: admin.id, permissionKey: PERMISSIONS.USERS_READ });
    ctx = await loadAdminContext(admin.id);
    expect(can(ctx, PERMISSIONS.USERS_READ)).toBe(true);

    await revokePermission({ actorUserId: su.id, targetUserId: admin.id, permissionKey: PERMISSIONS.USERS_READ });
    ctx = await loadAdminContext(admin.id);
    expect(can(ctx, PERMISSIONS.USERS_READ)).toBe(false);
  });

  it("anti-lockout: cannot demote your own super, nor remove the last active super", async () => {
    const su = await freshUser();
    await bootstrapSuperAdmin({ username: su.username });

    // self-super demotion refused
    await expect(
      setAdmin({ actorUserId: su.id, targetUserId: su.id, role: "ADMIN" }),
    ).rejects.toMatchObject({ code: "SELF_SUPER" });

    // a second super exists, then is demoted → su is the last super; removing su fails
    const su2 = await freshUser();
    await setAdmin({ actorUserId: su.id, targetUserId: su2.id, role: "SUPER_ADMIN" });
    await setAdmin({ actorUserId: su.id, targetUserId: su2.id, role: "ADMIN" }); // ok, su remains
    await expect(
      removeAdmin({ actorUserId: su2.id, targetUserId: su.id }),
    ).rejects.toMatchObject({ code: "LAST_SUPER" });
  });

  it("promote-to-super by a non-super actor is refused", async () => {
    const su = await freshUser();
    await bootstrapSuperAdmin({ username: su.username });
    const admin = await freshUser();
    await setAdmin({ actorUserId: su.id, targetUserId: admin.id, role: "ADMIN" });
    const victim = await freshUser();
    await expect(
      setAdmin({ actorUserId: admin.id, targetUserId: victim.id, role: "SUPER_ADMIN" }),
    ).rejects.toMatchObject({ code: "NOT_SUPER" });
  });

  it("removeAdmin removes a plain admin (getManagedAdmin reflects it)", async () => {
    const su = await freshUser();
    await bootstrapSuperAdmin({ username: su.username });
    const admin = await freshUser();
    await setAdmin({ actorUserId: su.id, targetUserId: admin.id, role: "ADMIN" });
    expect(await getManagedAdmin(admin.playerNumber)).not.toBeNull();
    await removeAdmin({ actorUserId: su.id, targetUserId: admin.id });
    expect(await getManagedAdmin(admin.playerNumber)).toBeNull();
  });
});
