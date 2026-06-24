import { prisma } from "@fb/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** GET /api/profile/avatar/by-number/[playerNumber] — serve a player's avatar by
 *  their PUBLIC number (so the live table's seats can show avatars without
 *  exposing user ids). 404 when none uploaded → the seat falls back to a
 *  generated avatar. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ playerNumber: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  const num = Number((await params).playerNumber);
  if (!Number.isInteger(num)) return new Response("bad request", { status: 400 });

  const u = await prisma.user.findUnique({
    where: { playerNumber: num },
    select: { avatar: { select: { data: true, mimeType: true } } },
  });
  if (!u?.avatar) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(u.avatar.data), {
    headers: { "Content-Type": u.avatar.mimeType, "Cache-Control": "private, max-age=60" },
  });
}
