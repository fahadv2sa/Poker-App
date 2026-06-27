import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/games/lu-screen";
import { JoinForm } from "./join-form";
import { RoomBrowser, type RoomCardData } from "./room-browser";

export const dynamic = "force-dynamic";

type LiveRoom = { gameId: string; filled: number; max: number; bots: number; humans: number };

/**
 * Live seat occupancy from the game-server's in-memory state (Quick Play rooms
 * are mostly bots, which never hit the DB). Read server-side; on any failure we
 * fall back to the DB human count, so the page never breaks if the game-server
 * is unreachable.
 */
async function fetchLiveOccupancy(): Promise<Map<string, LiveRoom>> {
  const base =
    process.env.GAME_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
    "http://localhost:4000";
  try {
    const headers: Record<string, string> = {};
    if (process.env.INTERNAL_API_TOKEN) headers["x-internal-token"] = process.env.INTERNAL_API_TOKEN;
    const res = await fetch(`${base}/internal/rooms`, { headers, cache: "no-store" });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { rooms?: LiveRoom[] };
    return new Map((data.rooms ?? []).map((r) => [r.gameId, r]));
  } catch {
    return new Map();
  }
}

function modeOf(config: unknown): "MANUAL" | "AUTO" {
  return (config as { resolveMode?: string } | null)?.resolveMode === "AUTO" ? "AUTO" : "MANUAL";
}

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Public (الغرف العامة) = Quick Play rooms that are still live (not ABANDONED).
  // Friends (غرف الأصدقاء) = manually-created rooms open in the lobby. Both pull
  // real data; bot seats are layered in from the live occupancy read below.
  const [publicRaw, friendsRaw, live] = await Promise.all([
    prisma.game.findMany({
      where: { kind: "QUICK_PLAY", status: { not: "ABANDONED" } },
      select: {
        id: true,
        roomName: true,
        difficulty: true,
        maxPlayers: true,
        config: true,
        creator: { select: { username: true } },
        _count: { select: { players: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.game.findMany({
      // Private rooms are NEVER listed — reachable only via invite link / room code.
      where: { kind: "MANUAL", status: "LOBBY", isPrivate: false },
      select: {
        id: true,
        roomName: true,
        difficulty: true,
        maxPlayers: true,
        config: true,
        creator: { select: { username: true } },
        _count: { select: { players: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    fetchLiveOccupancy(),
  ]);

  const publicRooms: RoomCardData[] = publicRaw.map((r) => {
    const l = live.get(r.id);
    return {
      id: r.id,
      roomName: r.roomName,
      creator: r.creator.username,
      difficulty: r.difficulty,
      maxPlayers: r.maxPlayers,
      // Live occupancy INCLUDING bots so the table reads as full; bots are never
      // exposed as such. Falls back to the DB human count if the game-server is
      // unreachable.
      filled: l?.filled ?? r._count.players,
      mode: modeOf(r.config),
      kind: "PUBLIC",
    };
  });

  const friendsRooms: RoomCardData[] = friendsRaw.map((r) => ({
    id: r.id,
    roomName: r.roomName,
    creator: r.creator.username,
    difficulty: r.difficulty,
    maxPlayers: r.maxPlayers,
    filled: r._count.players,
    mode: modeOf(r.config),
    kind: "FRIENDS",
  }));

  return (
    <LuScreen>
      <LuHeader icon={<span className="text-xl">♣</span>} title="دخول غرفة" subtitle="انضمّ بكود دعوة أو من الغرف" />

      <LuPanel className="mb-4 mt-3">
        <h2 className="mb-4 text-lg font-bold text-[var(--lu-cream)]">دخول بكود</h2>
        <JoinForm />
      </LuPanel>

      <RoomBrowser publicRooms={publicRooms} friendsRooms={friendsRooms} />
    </LuScreen>
  );
}
