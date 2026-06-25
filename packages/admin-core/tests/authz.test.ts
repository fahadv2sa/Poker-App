import { describe, expect, it } from "vitest";
import { PERMISSIONS, LINK_UP_SCOPE, PLATFORM_SCOPE } from "@fb/shared";
import { can, isSuperAdmin, type AdminContext } from "../src/authz.js";

const superAdmin: AdminContext = {
  userId: "u-super",
  role: "SUPER_ADMIN",
  grants: new Map(),
};

function admin(grants: Record<string, string[]>): AdminContext {
  const map = new Map<string, Set<string>>();
  for (const [scope, keys] of Object.entries(grants)) {
    map.set(scope, new Set(keys));
  }
  return { userId: "u-admin", role: "ADMIN", grants: map };
}

describe("can()", () => {
  it("SUPER_ADMIN bypasses every check, in any scope", () => {
    expect(can(superAdmin, PERMISSIONS.COINS_ADJUST)).toBe(true);
    expect(can(superAdmin, PERMISSIONS.USERS_DELETE, LINK_UP_SCOPE)).toBe(true);
    expect(isSuperAdmin(superAdmin)).toBe(true);
  });

  it("ADMIN is allowed only for explicitly granted keys", () => {
    const a = admin({ [PLATFORM_SCOPE]: [PERMISSIONS.USERS_READ, PERMISSIONS.COINS_READ] });
    expect(can(a, PERMISSIONS.USERS_READ)).toBe(true);
    expect(can(a, PERMISSIONS.COINS_READ)).toBe(true);
    expect(can(a, PERMISSIONS.COINS_ADJUST)).toBe(false);
    expect(can(a, PERMISSIONS.USERS_DELETE)).toBe(false);
    expect(isSuperAdmin(a)).toBe(false);
  });

  it("ADMIN grants are scope-exact (no cross-scope leakage)", () => {
    const a = admin({ [LINK_UP_SCOPE]: [PERMISSIONS.GAMES_FORCE_CLOSE] });
    // granted in link_up scope
    expect(can(a, PERMISSIONS.GAMES_FORCE_CLOSE, LINK_UP_SCOPE)).toBe(true);
    // same key, different (platform) scope → denied
    expect(can(a, PERMISSIONS.GAMES_FORCE_CLOSE, PLATFORM_SCOPE)).toBe(false);
  });

  it("denies when context is null/undefined (no admin)", () => {
    expect(can(null, PERMISSIONS.USERS_READ)).toBe(false);
    expect(can(undefined, PERMISSIONS.USERS_READ)).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});
