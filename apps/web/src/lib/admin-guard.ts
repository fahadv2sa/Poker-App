import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { can, loadAdminContext, type AdminContext } from "@fb/admin-core";
import type { PermissionKey } from "@fb/shared";
import { ipAllowed } from "./admin-ip";
import { readAdminSessionUserId } from "./admin-session";

/**
 * Server-side gate for the /admin dashboard pages.
 *
 * Authentication is the INDEPENDENT admin session (its own cookie), NOT the
 * players' game login. Anyone without a valid admin session — or whose account is
 * not (or no longer) an ACTIVE admin — is sent to `/admin/login`. This is the
 * single place page-level admin authorization is decided, and it runs ONLY under
 * /admin, so it adds nothing to player-facing traffic.
 */
export async function requireAdminPage(): Promise<AdminContext> {
  // Optional IP allowlist (opt-in via ADMIN_IP_ALLOWLIST), checked first.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!ipAllowed(process.env.ADMIN_IP_ALLOWLIST, ip)) notFound();

  const userId = await readAdminSessionUserId();
  if (!userId) redirect("/admin/login");

  // Re-checked on every request, so revoking/suspending an admin takes effect
  // immediately (the session cookie alone never grants access).
  const ctx = await loadAdminContext(userId);
  if (!ctx) redirect("/admin/login");

  return ctx;
}

/**
 * Like `requireAdminPage`, but also requires a specific permission for the
 * section. A logged-in admin lacking the grant gets a 404. SUPER_ADMIN passes
 * everything via `can()`.
 */
export async function requireAdminCan(
  permission: PermissionKey,
  scope?: string,
): Promise<AdminContext> {
  const ctx = await requireAdminPage();
  if (!can(ctx, permission, scope)) notFound();
  return ctx;
}
