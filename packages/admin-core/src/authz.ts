import type { AdminRole, PermissionKey } from "@fb/shared";
import { PLATFORM_SCOPE } from "@fb/shared";

/**
 * An admin's authorization context: the tier plus the granted permission keys,
 * indexed by scope. Built once from the platform.admins / admin_permissions rows
 * by `loadAdminContext`. Pure data — `can()` never touches the DB, so the only
 * cost on a request is the single lookup that builds this, and that runs ONLY on
 * admin routes, never on player traffic.
 */
export interface AdminContext {
  userId: string;
  role: AdminRole;
  /** scope → set of granted permission keys (empty/irrelevant for SUPER_ADMIN). */
  grants: Map<string, Set<string>>;
}

/**
 * The single authorization gate for the whole dashboard.
 *
 *  - SUPER_ADMIN bypasses every check (implicit all-permissions).
 *  - ADMIN must hold the exact `permission` key within the requested `scope`.
 *
 * Adding a new capability is: define a key in `PERMISSIONS` (@fb/shared) and wrap
 * the action in `can(ctx, PERMISSIONS.X)`. No code branching per permission.
 *
 * Scope semantics (Phase 0): exact match. A platform-scoped grant does NOT imply
 * game scopes; cross-scope implication, if ever wanted, is a deliberate later
 * decision rather than an accidental privilege.
 */
export function can(
  ctx: AdminContext | null | undefined,
  permission: PermissionKey,
  scope: string = PLATFORM_SCOPE,
): boolean {
  if (!ctx) return false;
  if (ctx.role === "SUPER_ADMIN") return true;
  return ctx.grants.get(scope)?.has(permission) ?? false;
}

/** True if the context is an active super-admin. */
export function isSuperAdmin(ctx: AdminContext | null | undefined): boolean {
  return ctx?.role === "SUPER_ADMIN";
}
