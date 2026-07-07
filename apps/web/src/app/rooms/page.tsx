import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/games/lu-screen";
import { JoinForm } from "./join-form";
import { RoomBrowser, type RoomCardData } from "./room-browser";

export const dynamic = "force-dynamic";

function modeOf(config: unknown): "MANUAL" | "AUTO" {
  return (config as { resolveMode?: string } | null)?.resolveMode === "AUTO" ? "AUTO" : "MANUAL";
}

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // The browser lists joinable CREATED rooms only (open manual lobbies).
  // Quick-play tables are matchmaking-only and never appear here.
  const friendsRaw = await prisma.game.findMany({
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

      <RoomBrowser friendsRooms={friendsRooms} />
    </LuScreen>
  );
}
