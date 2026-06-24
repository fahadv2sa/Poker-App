import { errors, jwtVerify } from "jose";
import { realtimeClaimsSchema, type RealtimeClaims } from "@fb/shared";

/**
 * Socket authentication (FIX #1 / Section 16). The game server NEVER trusts a
 * client-supplied identity. It verifies the signed token the web minted from the
 * verified Auth.js session, using the SAME `AUTH_SECRET`, and reads the identity
 * from the verified claims. A missing/forged/tampered token throws
 * InvalidSessionError; an expired one throws SessionExpiredError so the client
 * can show a clean "session expired" message instead of crashing.
 */

export class InvalidSessionError extends Error {
  constructor(message = "invalid session token") {
    super(message);
    this.name = "InvalidSessionError";
  }
}

export class SessionExpiredError extends Error {
  constructor(message = "session token expired") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set on the game server — it must match the web app's AUTH_SECRET.",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Verify a realtime token and return its trusted claims. The identity is taken
 * ONLY from the cryptographically verified payload (sub/username/playerNumber).
 */
export async function verifyRealtimeToken(token: unknown): Promise<RealtimeClaims> {
  if (typeof token !== "string" || token.length === 0) {
    throw new InvalidSessionError("missing token");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] }));
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      throw new SessionExpiredError();
    }
    throw new InvalidSessionError();
  }

  const parsed = realtimeClaimsSchema.safeParse({
    userId: payload.sub,
    username: payload.username,
    playerNumber: payload.playerNumber,
  });
  if (!parsed.success) {
    throw new InvalidSessionError("malformed claims");
  }
  return parsed.data;
}
