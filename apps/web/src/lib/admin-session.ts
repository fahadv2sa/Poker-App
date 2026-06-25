import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * Independent admin session — completely separate from the players' Auth.js game
 * session. A jose-signed JWT (same key family as the OTP/realtime tokens) carried
 * in its OWN httpOnly cookie, scoped to `path=/admin` so it is never sent on
 * player routes. Being logged into the game grants nothing here, and vice-versa.
 *
 * Identity still maps to a `user_id` → `platform.admins` row, so the two-tier
 * model + audit + anti-lockout are unchanged; only the authentication surface for
 * /admin is its own.
 */

const COOKIE = "fb_admin";
const PURPOSE = "admin-session";
const TTL_SECONDS = 8 * 60 * 60; // 8h

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required for admin sessions)");
  return new TextEncoder().encode(secret);
}

export async function mintAdminSessionToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
}

async function verifyAdminSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function setAdminSessionCookie(userId: string): Promise<void> {
  const token = await mintAdminSessionToken(userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: TTL_SECONDS,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  (await cookies()).set(COOKIE, "", { httpOnly: true, path: "/admin", maxAge: 0 });
}

/** Resolve the admin session cookie to a userId, or null if absent/invalid/expired. */
export async function readAdminSessionUserId(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  return verifyAdminSessionToken(value);
}
