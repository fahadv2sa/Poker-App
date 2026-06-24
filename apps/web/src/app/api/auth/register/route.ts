import { NextResponse } from "next/server";
import { registerSchema } from "@fb/shared";
import { registerUserWithWallet, UsernameTakenError, EmailTakenError } from "@fb/db";
import { hashPassword } from "@/lib/argon";
import { authRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/auth/register (Section 13)
 * Creates the account + initializes Wallet/UserStats + credits the 1000 signup
 * bonus, atomically (see registerUserWithWallet). Input validated with Zod.
 * Rate-limited per IP (Section 16).
 */
export async function POST(req: Request) {
  if (!authRateLimit(await clientIp())) {
    return NextResponse.json(
      { error: "RATE_LIMITED", messageAr: "محاولات كثيرة، يُرجى المحاولة بعد قليل" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BAD_JSON", messageAr: "تعذّر قراءة الطلب" },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION",
        messageAr: parsed.error.issues[0]?.message ?? "مدخلات غير صحيحة",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { username, email, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    const user = await registerUserWithWallet({
      username,
      email,
      passwordHash,
      avatarSeed: username,
    });

    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        playerNumber: user.playerNumber,
        displayId: `#${user.playerNumber}`,
        balance: user.balance.toString(),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UsernameTakenError || err instanceof EmailTakenError) {
      return NextResponse.json(
        { error: err.code, messageAr: err.message },
        { status: 409 },
      );
    }
    console.error("register failed", err);
    return NextResponse.json(
      { error: "INTERNAL", messageAr: "حدث خطأ غير متوقع" },
      { status: 500 },
    );
  }
}
