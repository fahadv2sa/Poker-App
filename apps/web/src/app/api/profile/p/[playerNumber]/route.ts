import { NextResponse } from "next/server";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { friendStateOf, friendsCount, relationRow } from "@/lib/social";

export const runtime = "nodejs";

/** GET /api/profile/p/[playerNumber] — PUBLIC profile of a player (by their public
 *  number), plus the requester's relationship. Excludes private data (balance,
 *  cards). Every value comes from its existing source — no duplication. */
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
      metrics: { select: { level: true, wins: true, losses: true, biggestWin: true, biggestLoss: true } },
      avatar: { select: { updatedAt: true } },
    },
  });
  if (!u) {
    return NextResponse.json({ error: "NOT_FOUND", messageAr: "اللاعب غير موجود" }, { status: 404 });
  }

  const isSelf = u.id === me;
  const [row, friends] = await Promise.all([
    isSelf ? Promise.resolve(null) : relationRow(me, u.id),
    friendsCount(u.id),
  ]);

  return NextResponse.json({
    playerNumber: u.playerNumber,
    displayName: u.nickname ?? u.username,
    avatarUrl: u.avatar ? `/api/profile/avatar/${u.id}?v=${u.avatar.updatedAt.getTime()}` : null,
    avatarSeed: u.avatarSeed ?? u.username,
    level: u.metrics?.level ?? 1,
    likes: u.likesReceived,
    friends,
    wins: u.metrics?.wins ?? 0,
    losses: u.metrics?.losses ?? 0,
    biggestWin: (u.metrics?.biggestWin ?? 0n).toString(),
    biggestLoss: (u.metrics?.biggestLoss ?? 0n).toString(),
    isSelf,
    likedByMe: isSelf ? false : (await prisma.like.findUnique({
      where: { likerId_targetId: { likerId: me, targetId: u.id } },
      select: { id: true },
    })) != null,
    friendState: friendStateOf(row, me),
  });
}
