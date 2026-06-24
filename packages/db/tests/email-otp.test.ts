import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client";
import { registerUserWithWallet } from "../src/wallet";
import { issueOtp, verifyOtp, purgeExpiredOtps } from "../src/email-otp";
import { EmailTakenError } from "../src/errors";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from "@fp/shared";

/**
 * Signup email-OTP lifecycle against a real PostgreSQL (the guarantees are
 * DB-enforced: one active code per user, delete-on-verify, expiry, cooldown,
 * attempt cap). AUTH_SECRET must be present for code hashing.
 */

process.env.AUTH_SECRET ??= "test-secret-for-otp-hashing-0000000000";

const createdUserIds: string[] = [];

async function freshUser() {
  const username = `otp_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const user = await registerUserWithWallet({
    username,
    email: `${username}@test.local`,
    passwordHash: "argon2id$test",
  });
  createdUserIds.push(user.id);
  return user;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe("issueOtp", () => {
  it("issues a 6-digit code with a <=5min expiry and exactly one row", async () => {
    const user = await freshUser();
    const now = new Date();
    const res = await issueOtp(user.id, now);

    expect(res.status).toBe("issued");
    if (res.status !== "issued") return;
    expect(res.code).toMatch(/^\d{6}$/);
    expect(res.expiresAt.getTime()).toBe(now.getTime() + OTP_TTL_SECONDS * 1000);

    const rows = await prisma.emailOtp.count({ where: { userId: user.id } });
    expect(rows).toBe(1);

    // The plaintext code is never stored.
    const row = await prisma.emailOtp.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.codeHash).not.toContain(res.code);
  });

  it("refuses to reissue while the code is valid and within cooldown", async () => {
    const user = await freshUser();
    const now = new Date();
    await issueOtp(user.id, now);
    const second = await issueOtp(user.id, new Date(now.getTime() + 5_000)); // 5s later
    expect(second.status).toBe("cooldown");
    if (second.status === "cooldown") {
      expect(second.retryAfterSeconds).toBeGreaterThan(0);
      expect(second.retryAfterSeconds).toBeLessThanOrEqual(OTP_RESEND_COOLDOWN_SECONDS);
    }
  });

  it("replaces the code (resetting TTL + attempts) once the cooldown elapses", async () => {
    const user = await freshUser();
    const t0 = new Date();
    const first = await issueOtp(user.id, t0);
    const before = await prisma.emailOtp.findUniqueOrThrow({ where: { userId: user.id } });

    const t1 = new Date(t0.getTime() + (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000);
    const second = await issueOtp(user.id, t1);
    expect(second.status).toBe("issued");

    const after = await prisma.emailOtp.findUniqueOrThrow({ where: { userId: user.id } });
    expect(after.codeHash).not.toBe(before.codeHash); // re-hashed
    expect(after.attempts).toBe(0);
    expect(await prisma.emailOtp.count({ where: { userId: user.id } })).toBe(1); // still one row
    if (first.status === "issued" && second.status === "issued") {
      expect(second.expiresAt.getTime()).toBeGreaterThan(first.expiresAt.getTime());
    }
  });
});

describe("verifyOtp", () => {
  it("verifies the correct code, sets email_verified_at, and deletes the row", async () => {
    const user = await freshUser();
    const now = new Date();
    const issued = await issueOtp(user.id, now);
    if (issued.status !== "issued") throw new Error("expected issued");

    const res = await verifyOtp(user.id, issued.code, now);
    expect(res.status).toBe("verified");

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(await prisma.emailOtp.count({ where: { userId: user.id } })).toBe(0);
  });

  it("counts wrong attempts and kills the code at the cap", async () => {
    const user = await freshUser();
    const now = new Date();
    await issueOtp(user.id, now);

    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      const r = await verifyOtp(user.id, "000000", now);
      expect(r.status).toBe("invalid");
      if (r.status === "invalid") expect(r.attemptsRemaining).toBe(OTP_MAX_ATTEMPTS - i);
    }
    // The final wrong attempt exhausts and removes the code.
    const last = await verifyOtp(user.id, "000000", now);
    expect(last.status).toBe("locked");
    expect(await prisma.emailOtp.count({ where: { userId: user.id } })).toBe(0);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.emailVerifiedAt).toBeNull(); // never verified
  });

  it("treats an expired code as expired and removes it", async () => {
    const user = await freshUser();
    const t0 = new Date();
    const issued = await issueOtp(user.id, t0);
    if (issued.status !== "issued") throw new Error("expected issued");

    const past = new Date(t0.getTime() + (OTP_TTL_SECONDS + 1) * 1000);
    const res = await verifyOtp(user.id, issued.code, past);
    expect(res.status).toBe("expired");
    expect(await prisma.emailOtp.count({ where: { userId: user.id } })).toBe(0);
  });

  it("returns no_code when none exists", async () => {
    const user = await freshUser();
    const res = await verifyOtp(user.id, "123456");
    expect(res.status).toBe("no_code");
  });
});

describe("purgeExpiredOtps", () => {
  it("removes only expired rows", async () => {
    const user = await freshUser();
    const t0 = new Date();
    await issueOtp(user.id, t0);
    // Not yet expired.
    expect(await purgeExpiredOtps(t0)).toBeGreaterThanOrEqual(0);
    expect(await prisma.emailOtp.count({ where: { userId: user.id } })).toBe(1);
    // After expiry.
    await purgeExpiredOtps(new Date(t0.getTime() + (OTP_TTL_SECONDS + 1) * 1000));
    expect(await prisma.emailOtp.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("registerUserWithWallet email", () => {
  it("rejects a duplicate email with EmailTakenError", async () => {
    const user = await freshUser();
    const original = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(
      registerUserWithWallet({
        username: `other_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        email: original.email!,
        passwordHash: "x",
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});
