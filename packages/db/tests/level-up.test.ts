import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client";
import { acknowledgeLevelUp } from "../src/metrics";
import { registerUserWithWallet } from "../src/wallet";

/**
 * Level-up celebration gating: the modal fires when level > celebrated_level,
 * and acknowledging advances celebrated_level to the current level — so it fires
 * exactly once per level-up, shows the FINAL level on a multi-level jump, and
 * never re-fires until the next increase.
 */

const createdUserIds: string[] = [];

async function freshUserAt(level: number, celebratedLevel: number) {
  const username = `lu_${randomUUID().replace(/-/g, "").slice(0, 15)}`;
  const user = await registerUserWithWallet({ username, passwordHash: "argon2id$test" });
  createdUserIds.push(user.id);
  await prisma.playerMetrics.upsert({
    where: { userId: user.id },
    create: { userId: user.id, level, celebratedLevel },
    update: { level, celebratedLevel },
  });
  return user;
}
async function metrics(userId: string) {
  return prisma.playerMetrics.findUniqueOrThrow({
    where: { userId },
    select: { level: true, celebratedLevel: true },
  });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error("Cannot reach the database (run docker compose up + db:deploy).", { cause: err });
  }
});
afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe("level-up celebration gating", () => {
  it("fires once per level-up and advances on ack", async () => {
    const user = await freshUserAt(2, 1); // leveled 1 -> 2, not yet celebrated
    let m = await metrics(user.id);
    expect(m.level > m.celebratedLevel).toBe(true); // pending

    await acknowledgeLevelUp(user.id);
    m = await metrics(user.id);
    expect(m.celebratedLevel).toBe(2);
    expect(m.level > m.celebratedLevel).toBe(false); // consumed — won't re-show

    // Idempotent: a second ack with no new level is a no-op.
    await acknowledgeLevelUp(user.id);
    expect((await metrics(user.id)).celebratedLevel).toBe(2);
  });

  it("shows the FINAL level on a multi-level jump, then catches up", async () => {
    const user = await freshUserAt(5, 1); // jumped 1 -> 5
    const m = await metrics(user.id);
    expect(m.level > m.celebratedLevel).toBe(true);
    expect(m.level).toBe(5); // the modal would show 5 (the final new level)

    await acknowledgeLevelUp(user.id);
    expect((await metrics(user.id)).celebratedLevel).toBe(5);
  });

  it("does not fire when already caught up", async () => {
    const user = await freshUserAt(3, 3);
    const m = await metrics(user.id);
    expect(m.level > m.celebratedLevel).toBe(false);
  });
});
