import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import {
  PENDING_VERIFICATION_TTL_SECONDS,
  RESET_AUTHORIZED_TTL_SECONDS,
} from "@fp/shared";

/**
 * Forgot-password flow identity carriers (same signed-httpOnly-cookie pattern as
 * pending-verification). Two short-lived stages, both keyed to a userId resolved
 * server-side — never trusted from client input:
 *   1. PENDING-RESET — set by /forgot once we've issued+emailed a reset OTP; read
 *      by the reset code-entry page + its actions to know whose code to check.
 *   2. RESET-AUTHORIZED — set ONLY after the reset OTP is verified; gates the
 *      /reset-password page so a new password can't be set without a valid code.
 * Signed with AUTH_SECRET; cleared as the user advances. SERVER-ONLY.
 */

const PENDING_COOKIE = "fp_pending_reset";
const PENDING_PURPOSE = "pending-reset";
const AUTHORIZED_COOKIE = "fp_reset_authorized";
const AUTHORIZED_PURPOSE = "reset-authorized";

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required for password-reset cookies)");
  return new TextEncoder().encode(secret);
}

async function sign(purpose: string, userId: string, ttlSeconds: number): Promise<string> {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key());
}

async function read(cookie: string, purpose: string): Promise<string | null> {
  const token = (await cookies()).get(cookie)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== purpose || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

async function setCookie(name: string, value: string, ttlSeconds: number): Promise<void> {
  (await cookies()).set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
  });
}

// Stage 1 — pending reset (carries the user into the reset code-entry page).
export async function setPendingReset(userId: string): Promise<void> {
  const token = await sign(PENDING_PURPOSE, userId, PENDING_VERIFICATION_TTL_SECONDS);
  await setCookie(PENDING_COOKIE, token, PENDING_VERIFICATION_TTL_SECONDS);
}
export async function readPendingReset(): Promise<string | null> {
  return read(PENDING_COOKIE, PENDING_PURPOSE);
}
export async function clearPendingReset(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

// Stage 2 — reset authorized (set only after the OTP is verified; gates /reset-password).
export async function setResetAuthorized(userId: string): Promise<void> {
  const token = await sign(AUTHORIZED_PURPOSE, userId, RESET_AUTHORIZED_TTL_SECONDS);
  await setCookie(AUTHORIZED_COOKIE, token, RESET_AUTHORIZED_TTL_SECONDS);
}
export async function readResetAuthorized(): Promise<string | null> {
  return read(AUTHORIZED_COOKIE, AUTHORIZED_PURPOSE);
}
export async function clearResetAuthorized(): Promise<void> {
  (await cookies()).delete(AUTHORIZED_COOKIE);
}
