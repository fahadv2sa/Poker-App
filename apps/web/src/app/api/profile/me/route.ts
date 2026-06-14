import { NextResponse } from "next/server";
import { prisma } from "@fp/db";
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
