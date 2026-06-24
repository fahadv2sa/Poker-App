import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Social fencing: Quick Play bots (player_number >= 900000) must be excluded from
 * the social surfaces — they can't be liked or friended. The guard runs BEFORE any
 * DB access and returns a GENERIC message (it never reveals the target is a bot,
 * for anti-detection). These tests call the real route handlers with mocked auth +
 * prisma and assert: a bot number is rejected 403 with no DB lookup, while a normal
 * number passes the fence (reaching the prisma lookup).
 */

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@fb/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@/auth";
import { prisma } from "@fb/db";
import { POST as likePOST } from "@/app/api/social/like/route";
import { POST as friendPOST, DELETE as friendDELETE } from "@/app/api/social/friend/route";
import { POST as respondPOST } from "@/app/api/social/friend/respond/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new Request("http://t/api/social", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "me-1" } });
  findUnique.mockResolvedValue(null); // non-bot path → "not found", proving the fence was passed
});

const BOT = 900001;
const HUMAN = 100123;

describe("like — bot fencing", () => {
  it("rejects a bot (403) without touching the database", async () => {
    const res = await likePOST(req({ playerNumber: BOT }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.messageAr).not.toMatch(/بوت|آلي|bot/i); // never reveals it's a bot
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("lets a normal player number through the fence (reaches the DB lookup)", async () => {
    const res = await likePOST(req({ playerNumber: HUMAN }));
    expect(res.status).toBe(404); // our mocked lookup returns null
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});

describe("friend — bot fencing (POST + DELETE)", () => {
  it("rejects friending a bot (403), no DB access", async () => {
    const res = await friendPOST(req({ playerNumber: BOT }));
    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects DELETE on a bot (403), no DB access", async () => {
    const res = await friendDELETE(req({ playerNumber: BOT }));
    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("lets a normal number through to the DB lookup", async () => {
    const res = await friendPOST(req({ playerNumber: HUMAN }));
    expect(res.status).toBe(404);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});

describe("friend/respond — bot fencing", () => {
  it("rejects responding to a bot request (403), no DB access", async () => {
    const res = await respondPOST(req({ playerNumber: BOT, action: "accept" }));
    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("boundary at the reserved block", () => {
  it("900000 is fenced; 899999 is not", async () => {
    const fenced = await likePOST(req({ playerNumber: 900000 }));
    expect(fenced.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();

    const ok = await likePOST(req({ playerNumber: 899999 }));
    expect(ok.status).toBe(404); // passed the fence → DB lookup (null)
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
