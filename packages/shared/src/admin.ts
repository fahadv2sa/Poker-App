/**
 * Admin authority — shared contracts for the super-admin dashboard (Proposal 2).
 *
 * Consumed by the dashboard's authorization layer (`@fb/admin-core`), the web
 * app, and any future game on the platform. Two design rules live here:
 *
 *  1. TIERS ARE FIXED at two (`SUPER_ADMIN`, `ADMIN`). The role enum mirrors the
 *     Prisma `AdminRole`.
 *  2. PERMISSIONS ARE EXTENSIBLE. They are string KEYS (not a Postgres enum), so
 *     adding a capability = add a key below + guard the action with `can(...)`.
 *     No migration is needed to introduce a new permission.
 *
 * A permission is granted within a SCOPE — the whole platform, or a specific
 * game (e.g. "link_up") — so the same admin model serves future games. A
 * SUPER_ADMIN bypasses all permission checks.
 */

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Scope constants. A grant targets either the platform or one game's namespace. */
export const PLATFORM_SCOPE = "platform";
export const LINK_UP_SCOPE = "link_up";

/**
 * The permission registry — the single source of truth for capability keys.
 * Extend by adding an entry here and wrapping the new action in `can(...)`.
 */
export const PERMISSIONS = {
  // Identity & social (platform schema)
  USERS_READ: "users.read",
  USERS_BAN: "users.ban",
  USERS_RESET_PASSWORD: "users.reset_password",
  USERS_VERIFY_EMAIL: "users.verify_email",
  USERS_DELETE: "users.delete",
  // Economy (Link Up)
  COINS_READ: "coins.read",
  COINS_ADJUST: "coins.adjust",
  // Football reference data
  FOOTBALL_READ: "football.read",
  FOOTBALL_EDIT: "football.edit",
  FOOTBALL_IMPORT: "football.import",
  FOOTBALL_RECALC_SCORES: "football.recalc_scores",
  // Games / live runtime
  GAMES_READ: "games.read",
  GAMES_FORCE_CLOSE: "games.force_close",
  GAMES_KICK_SEAT: "games.kick_seat",
  // Ops / content
  BOTS_TOGGLE: "bots.toggle",
  BADGES_MANAGE: "badges.manage",
  HAND_RANKS_MANAGE: "hand_ranks.manage",
  // Admin management — super-only by default (appoint/remove/grant)
  ADMIN_MANAGE: "admin.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All known permission keys (e.g. for a "grant all" UI or validation). */
export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[];

/** Runtime guard: is `value` a known permission key? */
export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as string[]).includes(value);
}
