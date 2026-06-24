import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  OTP_CODE_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from "@fp/shared";
import { prisma } from "./client";

/**
 * Signup email-OTP service. The single source of truth for code lifecycle and the
 * data-hygiene rules (Section: email verification):
 *   - At most ONE active code per user (DB-enforced via unique user_id) — a
 *     re-issue UPSERTS that row, so codes never accumulate.
 *   - Codes are stored only as an HMAC-SHA256 hash (keyed on AUTH_SECRET), never
 *     in plaintext. The plaintext is returned to the caller ONCE, to be emailed.
 *   - expiresAt is at most OTP_TTL_SECONDS out (5 min).
 *   - Deleted on successful verify; expired rows purged opportunistically on each
 *     issue/verify (no cron needed — the table self-bounds).
 *   - Resend cooldown: while a code is still valid, a new one may only be issued
 *     after OTP_RESEND_COOLDOWN_SECONDS, and it REPLACES the old (re-hash, reset
 *     TTL + attempts). Wrong guesses are capped at OTP_MAX_ATTEMPTS.
 *
 * Node-runtime only (uses node:crypto + AUTH_SECRET).
 */

function otpSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required to hash OTP codes)");
  return secret;
}

function hashCode(code: string): string {
  return createHmac("sha256", otpSecret()).update(code).digest("hex");
}

/** Cryptographically-random zero-padded numeric code (e.g. "048213"). */
function generateCode(): string {
  return randomInt(0, 10 ** OTP_CODE_LENGTH)
    .toString()
    .padStart(OTP_CODE_LENGTH, "0");
}

/** Constant-time compare of two hex-encoded hashes of equal length. */
function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type IssueOtpOutcome =
  | { status: "issued"; code: string; expiresAt: Date }
  | { status: "cooldown"; retryAfterSeconds: number };

/**
 * Issue (or replace) the user's single active OTP. Returns the plaintext code to
 * email on success, or a cooldown when a still-valid code was sent too recently.
 */
export async function issueOtp(userId: string, now: Date = new Date()): Promise<IssueOtpOutcome> {
  // Opportunistic purge — keeps the table free of dead rows with no scheduler.
  await prisma.emailOtp.deleteMany({ where: { expiresAt: { lt: now } } });

  const existing = await prisma.emailOtp.findUnique({ where: { userId } });
  if (existing && existing.expiresAt > now) {
    // createdAt is reset to the send time on every (re)issue, so the cooldown is
    // anchored to the last SEND — not bumped by wrong-guess attempt updates.
    const cooldownEndsMs = existing.createdAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000;
    if (cooldownEndsMs > now.getTime()) {
      return {
        status: "cooldown",
        retryAfterSeconds: Math.ceil((cooldownEndsMs - now.getTime()) / 1000),
      };
    }
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

  await prisma.emailOtp.upsert({
    where: { userId },
    create: { userId, codeHash, expiresAt, attempts: 0, createdAt: now },
    update: { codeHash, expiresAt, attempts: 0, createdAt: now },
  });

  return { status: "issued", code, expiresAt };
}

export type VerifyOtpOutcome =
  | { status: "verified" }
  | { status: "invalid"; attemptsRemaining: number }
  | { status: "expired" }
  | { status: "no_code" }
  | { status: "locked" };

/**
 * Verify a submitted code for a user. On success: set users.email_verified_at and
 * DELETE the code in one transaction. On miss: increment attempts (killing the
 * code once OTP_MAX_ATTEMPTS is reached). Expired/exhausted codes are removed.
 */
export async function verifyOtp(
  userId: string,
  code: string,
  now: Date = new Date(),
): Promise<VerifyOtpOutcome> {
  const row = await prisma.emailOtp.findUnique({ where: { userId } });
  if (!row) return { status: "no_code" };

  if (row.expiresAt <= now) {
    await prisma.emailOtp.deleteMany({ where: { userId } });
    return { status: "expired" };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.emailOtp.deleteMany({ where: { userId } });
    return { status: "locked" };
  }

  if (!hashesEqual(row.codeHash, hashCode(code))) {
    const updated = await prisma.emailOtp.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
    const attemptsRemaining = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);
    if (attemptsRemaining === 0) {
      await prisma.emailOtp.deleteMany({ where: { userId } });
      return { status: "locked" };
    }
    return { status: "invalid", attemptsRemaining };
  }

  // Success — mark verified + drop the code atomically (delete-on-verify).
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } }),
    prisma.emailOtp.delete({ where: { userId } }),
  ]);
  return { status: "verified" };
}

/** Belt-and-suspenders bulk purge of expired codes (callable from a job if ever needed). */
export async function purgeExpiredOtps(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.emailOtp.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}
