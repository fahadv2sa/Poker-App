import { Prisma, prisma } from "@fb/db";

/**
 * One admin action to record. `action` is a permission key (e.g. "coins.adjust")
 * or a named operation (e.g. "admin.bootstrap_super_admin"). `before`/`after`
 * capture the change for accountability.
 */
export interface AdminAuditEntry {
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  scope?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Map an optional value to a Prisma JsonB input (SQL NULL when absent). */
function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

/**
 * Append an immutable audit row. The audit log is append-only and has NO foreign
 * key to `users` (deliberately) so history survives even if the actor account is
 * later deleted. Read ONLY by the dashboard — never by gameplay.
 */
export async function recordAdminAction(entry: AdminAuditEntry): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      scope: entry.scope ?? null,
      before: jsonOrDbNull(entry.before),
      after: jsonOrDbNull(entry.after),
      metadata: jsonOrDbNull(entry.metadata),
      ip: entry.ip ?? null,
    },
  });
}
