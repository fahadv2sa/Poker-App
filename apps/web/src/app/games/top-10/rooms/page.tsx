import { redirect } from "next/navigation";
import { JoinRoomIcon } from "@fb/top-10-ui";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/top-10/lu-screen";
import { JoinForm } from "./join-form";
import { RoomBrowser, type RoomCardData } from "./room-browser";

export const dynamic = "force-dynamic";
export const metadata = { title: "دخول غرفة — توب 10" };

type LiveRoom = {
  id: string;
  code: string | null;
  name?: string | null;
  difficulty: string;
  kind: "MANUAL" | "QUICK_PLAY";
  status: string;
  filled: number;
  max: number;
  creator: string;
};

/** Live room occupancy from the Top Ten game-server's in-memory state. Mirrors Link
 *  Up's read; on any failure we render empty so the page never breaks. */
async function fetchRooms(): Promise<LiveRoom[]> {
  const base =
    process.env.TOP10_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_TOP10_SERVER_URL ??
    "http://localhost:4100";
  try {
    const res = await fetch(`${base}/internal/rooms`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { rooms?: LiveRoom[] };
    return data.rooms ?? [];
  } catch {
    return [];
  }
}

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const live = await fetchRooms();
  // Public (الغرف العامة) = live quick-play tables. Friends (غرف الأصدقاء) = open
  // manual rooms waiting in their lobby (no bots — created from /create-room).
  const publicRooms: RoomCardData[] = live
    .filter((r) => r.kind === "QUICK_PLAY")
    .map((r) => ({
      id: r.id,
      code: null,
      name: null,
      creator: r.creator,
      difficulty: r.difficulty,
      maxPlayers: r.max,
      filled: r.filled,
      kind: "PUBLIC",
    }));
  const friendsRooms: RoomCardData[] = live
    .filter((r) => r.kind === "MANUAL")
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name ?? null,
      creator: r.creator,
      difficulty: r.difficulty,
      maxPlayers: r.max,
      filled: r.filled,
      kind: "FRIENDS",
    }));

  return (
    <LuScreen>
      <LuHeader icon={<JoinRoomIcon size={22} />} title="دخول غرفة" subtitle="انضمّ بكود دعوة أو من الغرف" />
      <LuPanel className="mb-4 mt-3">
        <h2 className="mb-4 text-lg font-bold text-[var(--lu-cream)]">دخول بكود</h2>
        <JoinForm />
      </LuPanel>
      <RoomBrowser publicRooms={publicRooms} friendsRooms={friendsRooms} />
    </LuScreen>
  );
}
