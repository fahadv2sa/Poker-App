import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, prisma } from "@fp/db";
import { DEFAULT_GAME_CONFIG, DIFFICULTIES, RESOLVE_MODES } from "@fp/shared";
import { auth } from "@/auth";
import { hashPassword } from "@/lib/argon";

export const runtime = "nodejs";

const createRoomSchema = z.object({
  roomName: z.string().trim().min(2, "اسم الغرفة قصير جدًا").max(40),
  isPrivate: z.boolean().default(false),
  maxPlayers: z.number().int().min(2).max(8).default(6),
  password: z.string().min(1).max(64).optional(),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
  resolveMode: z.enum(RESOLVE_MODES).default("MANUAL"),
});

/** Unguessable invite code (Section 16). */
function inviteCode(): string {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 8).toUpperCase();
}

/** GET /api/rooms — public, joinable rooms (Section 13). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rooms = await prisma.game.findMany({
    where: { isPrivate: false, status: "LOBBY" },
    select: {
      id: true,
      roomName: true,
      inviteCode: true,
      maxPlayers: true,
      _count: { select: { players: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(
    rooms.map((r) => ({
      id: r.id,
      roomName: r.roomName,
      inviteCode: r.inviteCode,
      players: r._count.players,
      maxPlayers: r.maxPlayers,
    })),
  );
}

/** POST /api/rooms — create a room (Section 13). */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON", messageAr: "تعذّر قراءة الطلب" }, { status: 400 });
  }

  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION", messageAr: parsed.error.issues[0]?.message ?? "مدخلات غير صحيحة" },
      { status: 422 },
    );
  }
  const { roomName, isPrivate, maxPlayers, password, difficulty, resolveMode } = parsed.data;

  const passwordHash = isPrivate && password ? await hashPassword(password) : null;
  const game = await prisma.game.create({
    data: {
      roomName,
      isPrivate,
      maxPlayers,
      passwordHash,
      difficulty,
      inviteCode: inviteCode(),
      createdBy: userId,
      // Per-table config (jsonb); resolveMode is the creator's Auto/Manual choice.
      config: { ...DEFAULT_GAME_CONFIG, resolveMode } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, inviteCode: true },
  });

  return NextResponse.json({ id: game.id, inviteCode: game.inviteCode }, { status: 201 });
}
