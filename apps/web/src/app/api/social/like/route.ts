import { NextResponse } from "next/server";
import { prisma } from "@fp/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** POST /api/social/like { playerNumber } — toggle a like on a player (one per
 *  user). Server-authoritative: liker = session user; can't like yourself. The
 *  Like row and the denormalized User.likesReceived move together. */
export async function POST(req: Request) {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 });
  }
  let body: { playerNumber?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON", messageAr: "طلب غير صالح" }, { status: 400 });
  }
  const num = Number(body.playerNumber);
  if (!Number.isInteger(num)) {
    return NextResponse.json({ error: "BAD_ID", messageAr: "معرّف غير صالح" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { playerNumber: num }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND", messageAr: "اللاعب غير موجود" }, { status: 404 });
  }
  if (target.id === me) {
    return NextResponse.json({ error: "SELF", messageAr: "لا يمكنك الإعجاب بنفسك" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.like.findUnique({
      where: { likerId_targetId: { likerId: me, targetId: target.id } },
      select: { id: true },
    });
    if (existing) {
      await tx.like.delete({ where: { id: existing.id } });
      const u = await tx.user.update({
        where: { id: target.id },
        data: { likesReceived: { decrement: 1 } },
        select: { likesReceived: true },
      });
      return { liked: false, likes: u.likesReceived };
    }
    await tx.like.create({ data: { likerId: me, targetId: target.id } });
    const u = await tx.user.update({
      where: { id: target.id },
      data: { likesReceived: { increment: 1 } },
      select: { likesReceived: true },
    });
    return { liked: true, likes: u.likesReceived };
  });

  return NextResponse.json(result);
}
