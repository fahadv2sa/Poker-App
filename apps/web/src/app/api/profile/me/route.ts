import { NextResponse } from "next/server";
import { prisma } from "@fb/db";
import { validateNickname } from "@fb/shared";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** GET /api/profile/me (Section 13) — session-protected. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      playerNumber: true,
      avatarSeed: true,
      createdAt: true,
      wallet: { select: { balance: true, highestBalance: true } },
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "NOT_FOUND", messageAr: "المستخدم غير موجود" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
    playerNumber: user.playerNumber,
    displayId: `#${user.playerNumber}`,
    avatarSeed: user.avatarSeed,
    createdAt: user.createdAt,
    balance: user.wallet?.balance.toString() ?? "0",
    highestBalance: user.wallet?.highestBalance.toString() ?? "0",
  });
}

/** PATCH /api/profile/me — edit the signed-in user's own profile (nickname).
 *  Server-authoritative: the target is the SESSION user, never the request body. */
export async function PATCH(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON", messageAr: "تعذّر قراءة الطلب" }, { status: 400 });
  }

  const result = validateNickname((body as { nickname?: unknown })?.nickname);
  if ("error" in result) {
    return NextResponse.json({ error: "VALIDATION", messageAr: result.error }, { status: 422 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { nickname: result.value },
    select: { nickname: true, username: true },
  });
  return NextResponse.json({
    nickname: updated.nickname,
    displayName: updated.nickname ?? updated.username,
  });
}
