import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, registerUserWithWallet } from "@fb/db";
import { findUserIdByPlayerNumber, getOverview, getUserDetail, listUsers } from "../src/index.js";

/**
 * Read-view integration tests (real Postgres). They verify the admin data
 * services return the right rows with BigInts serialized as strings. Requires a
 * running, migrated DB (the add_admin_authority migration + base schema).
 */

const createdUserIds: string[] = [];

async function freshUser() {
  const username = `vw_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const u = await registerUserWithWallet({
    username,
    email: `${username}@test.local`,
    passwordHash: "argon2id$test",
  });
  createdUserIds.push(u.id);
  return { id: u.id, username, playerNumber: u.playerNumber };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error("Cannot reach the database for admin view tests.", { cause: err });
  }
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe("admin read views", () => {
  it("getOverview returns sane, serializable counts", async () => {
    const o = await getOverview();
    expect(o.users.total).toBeGreaterThanOrEqual(0);
    expect(o.users.humans + o.users.bots).toBe(o.users.total);
    expect(typeof o.economy.totalCoins).toBe("string");
    expect(o.football.players).toBeGreaterThanOrEqual(0);
  });

  it("listUsers finds a user by username and by exact player number", async () => {
    const u = await freshUser();
    const byName = await listUsers({ q: u.username });
    expect(byName.items.some((x) => x.id === u.id)).toBe(true);
    const byNumber = await listUsers({ q: String(u.playerNumber) });
    expect(byNumber.items.some((x) => x.playerNumber === u.playerNumber)).toBe(true);
    // BigInt balance is serialized to string
    expect(typeof byName.items[0]!.balance).toBe("string");
  });

  it("getUserDetail returns identity, wallet and a ledger array (strings)", async () => {
    const u = await freshUser();
    const id = await findUserIdByPlayerNumber(u.playerNumber);
    expect(id).toBe(u.id);

    const d = await getUserDetail(u.id);
    expect(d).not.toBeNull();
    expect(d!.username).toBe(u.username);
    expect(typeof d!.wallet?.balance).toBe("string");
    expect(Array.isArray(d!.recentLedger)).toBe(true);
  });
});
