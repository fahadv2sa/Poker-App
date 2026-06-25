import { prisma } from "@fb/db";
import { BOT_PLAYER_NUMBER_BASE, isPermissionKey, type AdminRole } from "@fb/shared";
import { recordAdminAction } from "../audit.js";
import { AdminActionError } from "../errors.js";

// ── Reads ───────────────────────────────────────────────────────────────────

export interface AdminListItem {
  userId: string;
  playerNumber: number;
  username: string;
  role: AdminRole;
  status: "ACTIVE" | "SUSPENDED";
  permissions: { permissionKey: string; scope: string }[];
  createdAt: string;
}

function mapAdmin(a: {
  userId: string;
  role: AdminRole;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: Date;
  user: { username: string; playerNumber: number };
  permissions: { permissionKey: string; scope: string }[];
}): AdminListItem {
  return {
    userId: a.userId,
    playerNumber: a.user.playerNumber,
    username: a.user.username,
    role: a.role,
    status: a.status,
    permissions: a.permissions.map((p) => ({ permissionKey: p.permissionKey, scope: p.scope })),
    createdAt: a.createdAt.toISOString(),
  };
}

export async function listAdmins(): Promise<AdminListItem[]> {
  const rows = await prisma.admin.findMany({
    include: {
      user: { select: { username: true, playerNumber: true } },
      permissions: { select: { permissionKey: true, scope: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapAdmin);
}

export async function getManagedAdmin(playerNumber: number): Promise<AdminListItem | null> {
  const user = await prisma.user.findUnique({ where: { playerNumber }, select: { id: true } });
  if (!user) return null;
  const a = await prisma.admin.findUnique({
    where: { userId: user.id },
    include: {
      user: { select: { username: true, playerNumber: true } },
      permissions: { select: { permissionKey: true, scope: true } },
    },
  });
  return a ? mapAdmin(a) : null;
}

// ── Guards ──────────────────────────────────────────────────────────────────

/** Count ACTIVE super-admins, optionally excluding one user (the target). */
async function activeSuperCount(excludeUserId?: string): Promise<number> {
  return prisma.admin.count({
    where: {
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
  });
}

async function isActorSuper(actorUserId: string): Promise<boolean> {
  const a = await prisma.admin.findUnique({
    where: { userId: actorUserId },
    select: { role: true, status: true },
  });
  return a?.role === "SUPER_ADMIN" && a.status === "ACTIVE";
}

/** Anti-lockout: refuse an op that would strip the LAST active super-admin, or
 *  that the actor applies to their OWN super-admin role. */
async function guardSuperLoss(
  actorUserId: string,
  targetUserId: string,
  isActiveSuperTarget: boolean,
): Promise<void> {
  if (!isActiveSuperTarget) return;
  if (targetUserId === actorUserId) {
    throw new AdminActionError("SELF_SUPER", "you cannot remove/demote your own super-admin");
  }
  if ((await activeSuperCount(targetUserId)) === 0) {
    throw new AdminActionError("LAST_SUPER", "cannot remove/demote the last active super-admin");
  }
}

// ── Writes (all audited; admin.manage is the gating permission) ──────────────

/** Appoint a user as admin or change an existing admin's tier. Promoting to
 *  SUPER_ADMIN requires the actor to be a super-admin (no escalation by a
 *  delegated admin). Demoting an active super is anti-lockout guarded. */
export async function setAdmin(opts: {
  actorUserId: string;
  targetUserId: string;
  role: AdminRole;
  ip?: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: opts.targetUserId },
    select: { playerNumber: true },
  });
  if (!user) throw new AdminActionError("NOT_FOUND", "user not found");
  if (user.playerNumber >= BOT_PLAYER_NUMBER_BASE) {
    throw new AdminActionError("BOT", "cannot make a bot an admin");
  }

  if (opts.role === "SUPER_ADMIN" && !(await isActorSuper(opts.actorUserId))) {
    throw new AdminActionError("NOT_SUPER", "only a super-admin can grant super-admin");
  }

  const existing = await prisma.admin.findUnique({ where: { userId: opts.targetUserId } });
  const demotingSuper =
    existing?.role === "SUPER_ADMIN" && existing.status === "ACTIVE" && opts.role !== "SUPER_ADMIN";
  await guardSuperLoss(opts.actorUserId, opts.targetUserId, demotingSuper);

  await prisma.admin.upsert({
    where: { userId: opts.targetUserId },
    create: {
      userId: opts.targetUserId,
      role: opts.role,
      status: "ACTIVE",
      grantedByUserId: opts.actorUserId,
    },
    update: { role: opts.role, status: "ACTIVE", revokedAt: null },
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "admin.manage",
    targetType: "admin",
    targetId: opts.targetUserId,
    before: existing ? { role: existing.role, status: existing.status } : null,
    after: { role: opts.role, op: existing ? "set_role" : "appoint" },
    ip: opts.ip,
  });
}

/** Revoke admin entirely (deletes the row + its permission grants). Anti-lockout
 *  guarded for an active super. */
export async function removeAdmin(opts: {
  actorUserId: string;
  targetUserId: string;
  ip?: string;
}): Promise<void> {
  const existing = await prisma.admin.findUnique({ where: { userId: opts.targetUserId } });
  if (!existing) throw new AdminActionError("NOT_FOUND", "not an admin");
  await guardSuperLoss(
    opts.actorUserId,
    opts.targetUserId,
    existing.role === "SUPER_ADMIN" && existing.status === "ACTIVE",
  );

  await prisma.admin.delete({ where: { userId: opts.targetUserId } });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "admin.manage",
    targetType: "admin",
    targetId: opts.targetUserId,
    before: { role: existing.role, status: existing.status },
    after: { op: "remove" },
    ip: opts.ip,
  });
}

/** Suspend or re-activate an admin. Suspending an active super is anti-lockout guarded. */
export async function setAdminStatus(opts: {
  actorUserId: string;
  targetUserId: string;
  status: "ACTIVE" | "SUSPENDED";
  ip?: string;
}): Promise<void> {
  const existing = await prisma.admin.findUnique({ where: { userId: opts.targetUserId } });
  if (!existing) throw new AdminActionError("NOT_FOUND", "not an admin");
  if (opts.status === "SUSPENDED") {
    await guardSuperLoss(
      opts.actorUserId,
      opts.targetUserId,
      existing.role === "SUPER_ADMIN" && existing.status === "ACTIVE",
    );
  }

  await prisma.admin.update({
    where: { userId: opts.targetUserId },
    data: { status: opts.status },
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "admin.manage",
    targetType: "admin",
    targetId: opts.targetUserId,
    before: { status: existing.status },
    after: { op: "set_status", status: opts.status },
    ip: opts.ip,
  });
}

/** Grant a permission key (scoped) to an admin. SUPER_ADMIN ignores grants, so
 *  these matter for the ADMIN tier. */
export async function grantPermission(opts: {
  actorUserId: string;
  targetUserId: string;
  permissionKey: string;
  scope?: string;
  ip?: string;
}): Promise<void> {
  if (!isPermissionKey(opts.permissionKey)) {
    throw new AdminActionError("BAD_PERMISSION", "unknown permission key");
  }
  const admin = await prisma.admin.findUnique({
    where: { userId: opts.targetUserId },
    select: { id: true },
  });
  if (!admin) throw new AdminActionError("NOT_FOUND", "not an admin");
  const scope = opts.scope ?? "platform";

  await prisma.adminPermission.upsert({
    where: {
      adminId_permissionKey_scope: { adminId: admin.id, permissionKey: opts.permissionKey, scope },
    },
    create: {
      adminId: admin.id,
      permissionKey: opts.permissionKey,
      scope,
      grantedByUserId: opts.actorUserId,
    },
    update: {},
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "admin.manage",
    targetType: "admin",
    targetId: opts.targetUserId,
    after: { op: "grant", permissionKey: opts.permissionKey, scope },
    ip: opts.ip,
  });
}

/** Revoke a permission key (scoped) from an admin. */
export async function revokePermission(opts: {
  actorUserId: string;
  targetUserId: string;
  permissionKey: string;
  scope?: string;
  ip?: string;
}): Promise<void> {
  const admin = await prisma.admin.findUnique({
    where: { userId: opts.targetUserId },
    select: { id: true },
  });
  if (!admin) throw new AdminActionError("NOT_FOUND", "not an admin");
  const scope = opts.scope ?? "platform";

  await prisma.adminPermission.deleteMany({
    where: { adminId: admin.id, permissionKey: opts.permissionKey, scope },
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "admin.manage",
    targetType: "admin",
    targetId: opts.targetUserId,
    after: { op: "revoke", permissionKey: opts.permissionKey, scope },
    ip: opts.ip,
  });
}
