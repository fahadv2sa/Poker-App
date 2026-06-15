import { SignJWT } from "jose";
import type { RealtimeClaims } from "@fp/shared";

/**
 * Mints the short-lived token the browser passes to the game server's Socket.IO
 * handshake. SERVER-ONLY: it is called from server components/route handlers
 * after `auth()` has verified the session, so the identity comes from the
 * trusted session — never from the client. The token is signed (HS256) with the
 * SAME `AUTH_SECRET` the game server verifies with, so the two must not drift.
 *
 * Do NOT import this from a client component — it would leak AUTH_SECRET.
 */

const TOKEN_TTL = "12h"; // generous: only checked at the handshake, not per-action

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required to mint realtime tokens)");
  return new TextEncoder().encode(secret);
}

export async function signRealtimeToken(claims: RealtimeClaims): Promise<string> {
  return new SignJWT({
    username: claims.username,
    playerNumber: claims.playerNumber,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}
