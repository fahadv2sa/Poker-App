import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /admin gate authenticates via the INDEPENDENT admin session (cookie), not
 * the game login. No session, or an account that is not an active admin → redirect
 * to /admin/login. An active admin → returns the context. We mock the session
 * reader, the admin-core loader, and Next's redirect/notFound (made to throw so
 * control stops) + headers (IP allowlist pass-through).
 */

vi.mock("@fb/admin-core", () => ({ loadAdminContext: vi.fn(), can: vi.fn() }));
vi.mock("@/lib/admin-session", () => ({ readAdminSessionUserId: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => null })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { loadAdminContext } from "@fb/admin-core";
import { readAdminSessionUserId } from "@/lib/admin-session";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-guard";

const loadCtx = loadAdminContext as unknown as ReturnType<typeof vi.fn>;
const readSession = readAdminSessionUserId as unknown as ReturnType<typeof vi.fn>;
const redirectMock = redirect as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("requireAdminPage", () => {
  it("redirects to /admin/login when there is no admin session", async () => {
    readSession.mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(loadCtx).not.toHaveBeenCalled();
  });

  it("redirects to /admin/login when the session user is not an active admin", async () => {
    readSession.mockResolvedValue("u-1");
    loadCtx.mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(loadCtx).toHaveBeenCalledWith("u-1");
  });

  it("returns the context for an active admin (no redirect)", async () => {
    readSession.mockResolvedValue("u-super");
    const ctx = { userId: "u-super", role: "SUPER_ADMIN", grants: new Map() };
    loadCtx.mockResolvedValue(ctx);
    await expect(requireAdminPage()).resolves.toBe(ctx);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
