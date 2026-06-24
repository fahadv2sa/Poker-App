import { SignJWT, jwtVerify } from "jose";

/**
 * One-time "post-verification login" token. After a user enters the correct OTP,
 * the verify action mints this short-lived signed token and hands it to
 * `signIn("otp-verified", { token })`; the provider's authorize verifies the
 * signature and logs that user in WITHOUT their password. Signed with AUTH_SECRET
 * (same key family as the realtime token), so identity can never be forged by the
 * client — passing a raw userId would let anyone log in as anyone.
 *
 * SERVER-ONLY. Pure jose (no cookies), so it is safe to import from auth.ts.
 */

const PURPOSE = "otp-login";
const TTL = "2m"; // minted and consumed within one request

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required for OTP login tokens)");
  return new TextEncoder().encode(secret);
}

export async function mintOtpLoginToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

/** Returns the userId if the token is a valid, unexpired OTP-login token, else null. */
export async function verifyOtpLoginToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
