import { NextResponse } from "next/server";
import { prisma } from "@fp/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** GET /api/profile/p/[playerNumber] — PUBLIC profile of a player (by their public
 *  number), plus the requester's relationship flags. Excludes private data
 *  (balance, cards). Used by the opponent-profile modal during play. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ playerNumber: string }> },
) {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 });
  }
  const num = Number((await params).playerNumber);
  if (!Number.isInteger(num)) {
    return NextResponse.json({ error: "BAD_ID", messageAr: "معرّف غير صالح" }, { status: 400 });
  }

  const u = await prisma.user.findUnique({
    where: { playerNumber: num },
    select: {
      id: true,
      username: true,
      nickname: true,
      playerNumber: true,
      avatarSeed: true,
      likesReceived: true,
      metrics: { select: { level: true, matches: true, wins: true, biggestWin: true } },
      avatar: { select: { updatedAt: true } },
    },
  });
  if (!u) {
    return NextResponse.json({ error: "NOT_FOUND", messageAr: "اللاعب غير موجود" }, { status: 404 });
  }

  const isSelf = u.id === me;
  const [a, b] = [me, u.id].sort() as [string, string];
  const [liked, friendship] = isSelf
    ? [null, null]
    : await Promise.all([
        prisma.like.findUnique({
          where: { likerId_targetId: { likerId: me, targetId: u.id } },
          select: { id: true },
        }),
        prisma.friendship.findUnique({
          where: { userAId_userBId: { userAId: a, userBId: b } },
          select: { id: true },
        }),
      ]);

  return NextResponse.json({
    playerNumber: u.playerNumber,
    displayName: u.nickname ?? u.username,
    avatarUrl: u.avatar ? `/api/profile/avatar/${u.id}?v=${u.avatar.updatedAt.getTime()}` : null,
    avatarSeed: u.avatarSeed ?? u.username,
    level: u.metrics?.level ?? 1,
    likes: u.likesReceived,
    matches: u.metrics?.matches ?? 0,
    wins: u.metrics?.wins ?? 0,
    biggestWin: (u.metrics?.biggestWin ?? 0n).toString(),
    isSelf,
    likedByMe: liked != null,
    isFriend: friendship != null,
  });
}
