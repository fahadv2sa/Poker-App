import { prisma } from "@fb/db";
import { recordAdminAction } from "./audit.js";

export interface BootstrapResult {
  userId: string;
  username: string;
  playerNumber: number;
  /** true = a brand-new SUPER_ADMIN row was created. */
  created: boolean;
  /** true = an existing non-super (or suspended) admin was raised to SUPER_ADMIN. */
  promoted: boolean;
  /** true = already an active SUPER_ADMIN; nothing changed (idempotent re-run). */
  alreadySuperAdmin: boolean;
}

/**
 * Idempotently designate exactly one account as SUPER_ADMIN, resolved by email
 * (preferred) or username from the platform `users` table. This is the only way
 * the first super-admin comes into existence (no UI can mint one before one
 * exists). Safe to re-run: an already-active SUPER_ADMIN is left untouched.
 *
 * Identity is resolved here at the platform level; the resulting authority is
 * keyed on the opaque `user_id` — the cross-game identity contract — so a future
 * game inherits the same admin. Records an audit entry on creation/promotion.
 *
 * Requires the admin tables to already exist on the target DB (apply the
 * migration FIRST — migrate-first discipline).
 */
export async function bootstrapSuperAdmin(opts: {
  email?: string;
  username?: string;
}): Promise<BootstrapResult> {
  if (!opts.email && !opts.username) {
    throw new Error("bootstrapSuperAdmin: provide an email or a username");
  }

  const user = await prisma.user.findFirst({
    where: opts.email ? { email: opts.email } : { username: opts.username },
    select: { id: true, username: true, playerNumber: true },
  });
  if (!user) {
    throw new Error(
      `bootstrapSuperAdmin: no user found for ${opts.email ? `email ${opts.email}` : `username ${opts.username}`}`,
    );
  }

  const existing = await prisma.admin.findUnique({ where: { userId: user.id } });
  if (existing && existing.role === "SUPER_ADMIN" && existing.status === "ACTIVE") {
    return {
      userId: user.id,
      username: user.username,
      playerNumber: user.playerNumber,
      created: false,
      promoted: false,
      alreadySuperAdmin: true,
    };
  }

  const promoted = !!existing;
  await prisma.admin.upsert({
    where: { userId: user.id },
    create: { userId: user.id, role: "SUPER_ADMIN", status: "ACTIVE" },
    update: { role: "SUPER_ADMIN", status: "ACTIVE", revokedAt: null },
  });

  await recordAdminAction({
    actorUserId: user.id,
    action: "admin.bootstrap_super_admin",
    targetType: "admin",
    targetId: user.id,
    after: {
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      resolvedBy: opts.email ? "email" : "username",
    },
  });

  return {
    userId: user.id,
    username: user.username,
    playerNumber: user.playerNumber,
    created: !existing,
    promoted,
    alreadySuperAdmin: false,
  };
}
