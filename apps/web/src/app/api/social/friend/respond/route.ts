import { NextResponse } from "next/server";
import { prisma } from "@fb/db";
import { isBotPlayerNumber } from "@fb/shared";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** POST /api/social/friend/respond { playerNumber, action: "accept"|"reject" } —
 *  the ADDRESSEE responds to a pending incoming request. Server-authoritative: it
 *  only matches a PENDING row where the addressee is the session user. */
export async function POST(req: Request) {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 });
  }
  let body: { playerNumber?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON", messageAr: "طلب غير صالح" }, { status: 400 });
  }
  const num = Number(body.playerNumber);
  const action = body.action;
  if (!Number.isInteger(num) || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ error: "BAD_INPUT", messageAr: "مدخلات غير صحيحة" }, { status: 400 });
  }
  // Bots never send requests; reject any response targeting a bot for consistency.
  if (isBotPlayerNumber(num)) {
    return NextResponse.json({ error: "FORBIDDEN", messageAr: "تعذّر تنفيذ هذا الإجراء" }, { status: 403 });
  }
  const requester = await prisma.user.findUnique({ where: { playerNumber: num }, select: { id: true } });
  if (!requester) {
    return NextResponse.json({ error: "NOT_FOUND", messageAr: "اللاعب غير موجود" }, { status: 404 });
  }

  // Only a PENDING request addressed to ME can be responded to.
  const row = await prisma.friendship.findFirst({
    where: { requesterId: requester.id, addresseeId: me, status: "PENDING" },
    select: { id: true },
  });
  if (!row) {
    return NextResponse.json({ error: "NO_REQUEST", messageAr: "لا يوجد طلب صداقة" }, { status: 404 });
  }

  await prisma.friendship.update({
    where: { id: row.id },
    data: { status: action === "accept" ? "ACCEPTED" : "REJECTED" },
  });
  return NextResponse.json({ friendState: action === "accept" ? "friends" : "none" });
}
