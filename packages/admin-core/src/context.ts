import { prisma } from "@fb/db";
import type { AdminContext } from "./authz.js";

/**
 * Load an admin's authorization context from the platform tables. Returns `null`
 * if the user is not an ACTIVE admin (the dashboard then treats them as a normal
 * user — i.e. no admin surface).
 *
 * This is the ONLY database read behind `can()`, and by design it runs only on
 * admin routes. The player-facing app and game-server never call it, so admin
 * data volume cannot affect live-game performance.
 */
export async function loadAdminContext(userId: string): Promise<AdminContext | null> {
  const admin = await prisma.admin.findUnique({
    where: { userId },
    include: { permissions: true },
  });
  if (!admin || admin.status !== "ACTIVE") return null;

  const grants = new Map<string, Set<string>>();
  for (const p of admin.permissions) {
    const set = grants.get(p.scope) ?? new Set<string>();
    set.add(p.permissionKey);
    grants.set(p.scope, set);
  }

  return { userId: admin.userId, role: admin.role, grants };
}
