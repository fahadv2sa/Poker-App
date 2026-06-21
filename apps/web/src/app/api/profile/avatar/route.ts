import { NextResponse } from "next/server";
import { prisma } from "@fp/db";
import { AVATAR_MAX_BYTES, isAvatarMime } from "@fp/shared";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** POST /api/profile/avatar — upload the signed-in user's own avatar (multipart,
 *  field `avatar`). Stored in the DB (Railway's filesystem is ephemeral). Limits:
 *  ≤ 256 KB, png/jpeg/webp. Server-authoritative (target = session user). */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "BAD_FORM", messageAr: "تعذّر قراءة الملف" }, { status: 400 });
  }
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "NO_FILE", messageAr: "لم يتم اختيار صورة" }, { status: 400 });
  }
  if (!isAvatarMime(file.type)) {
    return NextResponse.json(
      { error: "BAD_TYPE", messageAr: "الصيغة غير مدعومة (PNG أو JPEG أو WEBP فقط)" },
      { status: 422 },
    );
  }
  if (file.size === 0 || file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { error: "TOO_LARGE", messageAr: "حجم الصورة يجب ألا يتجاوز 256 كيلوبايت" },
      { status: 422 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  await prisma.userAvatar.upsert({
    where: { userId },
    create: { userId, data, mimeType: file.type },
    update: { data, mimeType: file.type },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/profile/avatar — remove the user's uploaded avatar (revert to the
 *  generated one). */
export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHENTICATED", messageAr: "يجب تسجيل الدخول" }, { status: 401 });
  }
  await prisma.userAvatar.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
