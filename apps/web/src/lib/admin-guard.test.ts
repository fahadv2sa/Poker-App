import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /admin gate must be invisible to non-admins: unauthenticated users AND
 * logged-in non-admins both get a 404 (notFound), never a 403 or redirect, with
 * no signal the area exists. Active admins get their context. We mock auth, the
 * admin-core context loader, and Next's notFound (made to throw so control stops).
 */

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@fb/admin-core", () => ({ loadAdminContext: vi.fn(), can: vi.fn() }));
vi.mock("next/headers", () => ({
  // No IP allowlist configured in tests → the guard's IP check is a pass-through.
  headers: vi.fn(async () => ({ get: () => null })),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { auth } from "@/auth";
import { loadAdminContext } from "@fb/admin-core";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-guard";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const loadCtx = loadAdminContext as unknown as ReturnType<typeof vi.fn>;
const notFoundMock = notFound as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("requireAdminPage", () => {
  it("404s when unauthenticated (no context lookup, no existence leak)", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(loadCtx).not.toHaveBeenCalled();
  });

  it("404s when authenticated but NOT an admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } });
    loadCtx.mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadCtx).toHaveBeenCalledWith("u-1");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("returns the context for an active admin (no 404)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-super" } });
    const ctx = { userId: "u-super", role: "SUPER_ADMIN", grants: new Map() };
    loadCtx.mockResolvedValue(ctx);
    await expect(requireAdminPage()).resolves.toBe(ctx);
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
