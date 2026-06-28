import { SignJWT } from "jose";
import type { RealtimeClaims } from "@fb/shared";

/**
 * Mints the short-lived token the browser passes to the Top Ten server's Socket.IO
 * handshake. SERVER-ONLY: called after `auth()` verifies the session, so identity
 * comes from the trusted session — never the client. Signed (HS256) with the SAME
 * AUTH_SECRET the Top Ten server verifies with (cross-game identity contract §3).
 */
const TOKEN_TTL = "12h";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required to mint realtime tokens)");
  return new TextEncoder().encode(secret);
}

export async function signRealtimeToken(claims: RealtimeClaims): Promise<string> {
  return new SignJWT({ username: claims.username, playerNumber: claims.playerNumber })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}
