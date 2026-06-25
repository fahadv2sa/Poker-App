import { prisma } from "@fb/db";
import { recordAdminAction } from "../audit.js";
import { AdminActionError } from "../errors.js";

/** Set or clear a user's email-verified state. */
export async function setEmailVerified(opts: {
  actorUserId: string;
  targetUserId: string;
  verified: boolean;
  ip?: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: opts.targetUserId },
    select: { emailVerifiedAt: true },
  });
  if (!user) throw new AdminActionError("NOT_FOUND", "user not found");

  await prisma.user.update({
    where: { id: opts.targetUserId },
    data: { emailVerifiedAt: opts.verified ? new Date() : null },
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "users.verify_email",
    targetType: "user",
    targetId: opts.targetUserId,
    before: { verified: user.emailVerifiedAt != null },
    after: { verified: opts.verified },
    ip: opts.ip,
  });
}

/**
 * Set a user's password to a pre-hashed value. Hashing happens in the caller
 * (the web app owns argon2id) so admin-core stays dependency-light. The plaintext
 * and the hash are never written to the audit log.
 */
export async function setUserPassword(opts: {
  actorUserId: string;
  targetUserId: string;
  passwordHash: string;
  ip?: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: opts.targetUserId },
    select: { id: true },
  });
  if (!user) throw new AdminActionError("NOT_FOUND", "user not found");

  await prisma.user.update({
    where: { id: opts.targetUserId },
    data: { passwordHash: opts.passwordHash },
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "users.reset_password",
    targetType: "user",
    targetId: opts.targetUserId,
    ip: opts.ip,
  });
}

/** Disable (ban) or re-enable an account. You cannot disable your own account. */
export async function setUserDisabled(opts: {
  actorUserId: string;
  targetUserId: string;
  disabled: boolean;
  ip?: string;
}): Promise<void> {
  if (opts.actorUserId === opts.targetUserId) {
    throw new AdminActionError("SELF_DISABLE", "you cannot disable your own account");
  }
  const user = await prisma.user.findUnique({
    where: { id: opts.targetUserId },
    select: { disabledAt: true },
  });
  if (!user) throw new AdminActionError("NOT_FOUND", "user not found");

  await prisma.user.update({
    where: { id: opts.targetUserId },
    data: { disabledAt: opts.disabled ? new Date() : null },
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "users.ban",
    targetType: "user",
    targetId: opts.targetUserId,
    before: { disabled: user.disabledAt != null },
    after: { disabled: opts.disabled },
    ip: opts.ip,
  });
}

/**
 * Permanently delete a user (cascades to wallet/ledger/stats/social/games). Hard
 * guardrails: you cannot delete yourself, and you cannot delete an admin account
 * (its admin role must be removed first) — this also protects super-admins.
 */
export async function deleteUserAccount(opts: {
  actorUserId: string;
  targetUserId: string;
  ip?: string;
}): Promise<void> {
  if (opts.actorUserId === opts.targetUserId) {
    throw new AdminActionError("SELF_DELETE", "you cannot delete your own account");
  }
  const user = await prisma.user.findUnique({
    where: { id: opts.targetUserId },
    select: { playerNumber: true, username: true, admin: { select: { role: true } } },
  });
  if (!user) throw new AdminActionError("NOT_FOUND", "user not found");
  if (user.admin) {
    throw new AdminActionError(
      "DELETE_ADMIN",
      "cannot delete an admin account — remove the admin role first",
    );
  }

  await prisma.user.delete({ where: { id: opts.targetUserId } });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "users.delete",
    targetType: "user",
    targetId: opts.targetUserId,
    before: { playerNumber: user.playerNumber, username: user.username },
    ip: opts.ip,
  });
}
