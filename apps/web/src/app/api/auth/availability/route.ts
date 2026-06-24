import { NextResponse } from "next/server";
import { prisma } from "@fp/db";
import { emailSchema, usernameSchema } from "@fp/shared";
import { availabilityRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Live availability check for the register page (UX only — the register action +
 * unique constraints remain the source of truth). Reuses the SAME format schemas
 * and the existing unique columns; no new schema. Rate-limited per IP.
 *
 * GET /api/auth/availability?email=…&username=…  (either or both)
 * → { email?: { valid, available }, username?: { valid, available } }
 *   valid     = passes the format rule
 *   available = no existing account uses it
 */
export async function GET(req: Request) {
  if (!availabilityRateLimit(await clientIp())) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const params = new URL(req.url).searchParams;
  const result: {
    email?: { valid: boolean; available: boolean };
    username?: { valid: boolean; available: boolean };
  } = {};

  const emailRaw = params.get("email");
  if (emailRaw !== null) {
    const parsed = emailSchema.safeParse(emailRaw);
    if (!parsed.success) {
      result.email = { valid: false, available: false };
    } else {
      const existing = await prisma.user.findUnique({
        where: { email: parsed.data },
        select: { id: true },
      });
      result.email = { valid: true, available: !existing };
    }
  }

  const usernameRaw = params.get("username");
  if (usernameRaw !== null) {
    const parsed = usernameSchema.safeParse(usernameRaw);
    if (!parsed.success) {
      result.username = { valid: false, available: false };
    } else {
      const existing = await prisma.user.findUnique({
        where: { username: parsed.data },
        select: { id: true },
      });
      result.username = { valid: true, available: !existing };
    }
  }

  return NextResponse.json(result);
}
