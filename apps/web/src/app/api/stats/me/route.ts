import { NextResponse } from "next/server";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { deriveStats } from "@/lib/stats";

export const runtime = "nodejs";

/**
 * GET /api/stats/me (Section 13/14) — session-protected. Stats are maintained
 * server-authoritatively by the game server after each match; this exposes them
 * with derived win-rate and achievements.
 */
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
      stats: true,
      wallet: { select: { highestBalance: true } },
    },
  });
  if (!user?.stats) {
    return NextResponse.json(
      { error: "NOT_FOUND", messageAr: "لا توجد إحصائيات" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    deriveStats({
      gamesPlayed: user.stats.gamesPlayed,
      wins: user.stats.wins,
      losses: user.stats.losses,
      folds: user.stats.folds,
      totalCoinsWon: user.stats.totalCoinsWon,
      totalCoinsLost: user.stats.totalCoinsLost,
      netProfitLoss: user.stats.netProfitLoss,
      highestBalance: user.wallet?.highestBalance ?? 0n,
    }),
  );
}
