import { prisma } from "@fb/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** GET /api/profile/avatar/[userId] — serve a player's uploaded avatar bytes.
 *  Keyed by userId so other players' profiles can reuse it later. Session-gated;
 *  404 when the user has no uploaded avatar (the UI falls back to a generated one). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthorized", { status: 401 });
  }
  const { userId } = await params;
  const avatar = await prisma.userAvatar.findUnique({ where: { userId } });
  if (!avatar) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.mimeType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
