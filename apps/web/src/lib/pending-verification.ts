import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { PENDING_VERIFICATION_TTL_SECONDS } from "@fb/shared";

/**
 * "Pending verification" identity carrier. Login is blocked for unverified users,
 * so /verify has no session to read the user from. Instead, register (and an
 * unverified login attempt) set this short-lived signed httpOnly cookie carrying
 * the userId; the /verify page and its actions read identity ONLY from here — never
 * from client input — which prevents enumerating or email-bombing arbitrary
 * accounts. Signed with AUTH_SECRET; cleared on successful verification.
 *
 * SERVER-ONLY (uses next/headers cookies()).
 */

const COOKIE = "fp_pending_verify";
const PURPOSE = "pending-verify";

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required for pending-verification cookie)");
  return new TextEncoder().encode(secret);
}

export async function setPendingVerification(userId: string): Promise<void> {
  const token = await new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_VERIFICATION_TTL_SECONDS}s`)
    .sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_VERIFICATION_TTL_SECONDS,
  });
}

/** The pending userId, or null if the cookie is missing/expired/invalid. */
export async function readPendingVerification(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function clearPendingVerification(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
