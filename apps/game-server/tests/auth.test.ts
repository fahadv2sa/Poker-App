import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  InvalidSessionError,
  SessionExpiredError,
  verifyRealtimeToken,
} from "../src/auth.js";

/**
 * FIX #1 — socket authentication. Proves identity comes ONLY from a token signed
 * with the shared AUTH_SECRET, that forged/tampered/expired/missing tokens are
 * rejected, and that a raw client-supplied identity is never trusted.
 */

const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const key = new TextEncoder().encode(SECRET);

interface Claims {
  userId: string;
  username: string;
  playerNumber: number;
}

async function sign(
  claims: Claims,
  opts: { exp?: string | number; secret?: Uint8Array } = {},
): Promise<string> {
  return new SignJWT({ username: claims.username, playerNumber: claims.playerNumber })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.secret ?? key);
}

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});

describe("verifyRealtimeToken (FIX #1)", () => {
  const valid: Claims = { userId: "u1", username: "messi", playerNumber: 100001 };

  it("accepts a token signed with AUTH_SECRET and returns the verified identity", async () => {
    const claims = await verifyRealtimeToken(await sign(valid));
    expect(claims).toEqual(valid);
  });

  it("rejects a missing or empty token", async () => {
    await expect(verifyRealtimeToken(undefined)).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(verifyRealtimeToken("")).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(verifyRealtimeToken(123)).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it("rejects a token signed with a DIFFERENT secret (forgery/impersonation)", async () => {
    const forged = await sign(
      { userId: "attacker", username: "evil", playerNumber: 1 },
      { secret: new TextEncoder().encode("a-different-secret-bbbbbbbbbbbbbbbbbb") },
    );
    await expect(verifyRealtimeToken(forged)).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it("rejects a tampered token", async () => {
    const token = await sign(valid);
    const parts = token.split(".");
    parts[2] = (parts[2]![0] === "A" ? "B" : "A") + parts[2]!.slice(1); // break the signature
    await expect(verifyRealtimeToken(parts.join("."))).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
  });

  it("rejects an expired token with SessionExpiredError (clean refresh path)", async () => {
    const token = await sign(valid, { exp: Math.floor(Date.now() / 1000) - 30 });
    await expect(verifyRealtimeToken(token)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("never trusts a raw client-supplied identity (only signed tokens)", async () => {
    await expect(
      verifyRealtimeToken(JSON.stringify({ userId: "attacker", username: "evil" })),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });
});
