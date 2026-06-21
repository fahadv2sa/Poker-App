import { NextResponse } from "next/server";
import { prisma } from "@fp/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

async function resolve(req: Request): Promise<
  | { error: ReturnType<typeof NextResponse.json> }
  | { me: string; targetId: string; a: string; b: string }
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
  const target = await prisma.user.findUnique({ where: { playerNumber: num }, select: { id: true } });
  if (!target) {
    return { error: NextResponse.json({ error: "NOT_FOUND", messageAr: "اللاعب غير موجود" }, { status: 404 }) };
  }
  if (target.id === me) {
    return { error: NextResponse.json({ error: "SELF", messageAr: "لا يمكنك إضافة نفسك" }, { status: 400 }) };
  }
  const [a, b] = [me, target.id].sort() as [string, string]; // canonical pair
  return { me, targetId: target.id, a, b };
}

/** POST /api/social/friend { playerNumber } — add a friend (symmetric, immediate).
 *  Idempotent: the unique pair upsert no-ops if already friends. */
export async function POST(req: Request) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  await prisma.friendship.upsert({
    where: { userAId_userBId: { userAId: r.a, userBId: r.b } },
    create: { userAId: r.a, userBId: r.b },
    update: {},
  });
  return NextResponse.json({ ok: true, isFriend: true });
}

/** DELETE /api/social/friend { playerNumber } — remove a friend (either side). */
export async function DELETE(req: Request) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  await prisma.friendship.deleteMany({ where: { userAId: r.a, userBId: r.b } });
  return NextResponse.json({ ok: true, isFriend: false });
}
