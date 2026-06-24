import { NextResponse } from "next/server";
import { prisma } from "@fb/db";
import { isBotPlayerNumber } from "@fb/shared";
import { auth } from "@/auth";
import { friendStateOf, relationRow } from "@/lib/social";

export const runtime = "nodejs";

async function target(req: Request): Promise<
  | { error: ReturnType<typeof NextResponse.json> }
  | { me: string; targetId: string }
> {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) {
    return { error: NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 }) };
  }
  let body: { playerNumber?: unknown };
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "BAD_JSON", messageAr: "طلب غير صالح" }, { status: 400 }) };
  }
  const num = Number(body.playerNumber);
  if (!Number.isInteger(num)) {
    return { error: NextResponse.json({ error: "BAD_ID", messageAr: "معرّف غير صالح" }, { status: 400 }) };
  }
  // Bots can't be friended (or have requests cancelled). Generic message — never
  // reveals the target is a bot — for anti-detection.
  if (isBotPlayerNumber(num)) {
    return { error: NextResponse.json({ error: "FORBIDDEN", messageAr: "تعذّر تنفيذ هذا الإجراء" }, { status: 403 }) };
  }
  const t = await prisma.user.findUnique({ where: { playerNumber: num }, select: { id: true } });
  if (!t) {
    return { error: NextResponse.json({ error: "NOT_FOUND", messageAr: "اللاعب غير موجود" }, { status: 404 }) };
  }
  if (t.id === me) {
    return { error: NextResponse.json({ error: "SELF", messageAr: "لا يمكنك إضافة نفسك" }, { status: 400 }) };
  }
  return { me, targetId: t.id };
}

/** POST /api/social/friend { playerNumber } — send a friend request. State machine:
 *  none→PENDING; if THEY already requested me → auto-accept; if already friends or
 *  already requested → no-op; a prior REJECTED row re-opens as PENDING from me. */
export async function POST(req: Request) {
  const r = await target(req);
  if ("error" in r) return r.error;
  const { me, targetId } = r;

  const friendState = await prisma.$transaction(async (tx) => {
    const row = await tx.friendship.findFirst({
      where: {
        OR: [
          { requesterId: me, addresseeId: targetId },
          { requesterId: targetId, addresseeId: me },
        ],
      },
    });
    if (!row) {
      await tx.friendship.create({ data: { requesterId: me, addresseeId: targetId, status: "PENDING" } });
      return "pending_out" as const;
    }
    if (row.status === "ACCEPTED") return "friends" as const;
    if (row.status === "PENDING") {
      if (row.requesterId === me) return "pending_out" as const; // already sent
      // They requested me → sending back auto-accepts.
      await tx.friendship.update({ where: { id: row.id }, data: { status: "ACCEPTED" } });
      return "friends" as const;
    }
    // REJECTED → reopen as a fresh request from me.
    await tx.friendship.update({
      where: { id: row.id },
      data: { requesterId: me, addresseeId: targetId, status: "PENDING" },
    });
    return "pending_out" as const;
  });

  return NextResponse.json({ friendState });
}

/** DELETE /api/social/friend { playerNumber } — remove a friend, or cancel an
 *  outgoing request, or drop an incoming one (whatever row exists between us). */
export async function DELETE(req: Request) {
  const r = await target(req);
  if ("error" in r) return r.error;
  const row = await relationRow(r.me, r.targetId);
  if (row) await prisma.friendship.delete({ where: { id: row.id } });
  return NextResponse.json({ friendState: friendStateOf(null, r.me) });
}
