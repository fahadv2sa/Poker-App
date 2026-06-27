import { LuHeader, LuPanel, LuScreen } from "@/components/games/lu-screen";
import { JoinForm } from "@/app/rooms/join-form";
import { RoomBrowser, type RoomCardData } from "@/app/rooms/room-browser";

/** PREVIEW ONLY — no auth/DB; mock rooms to judge the rooms redesign. */
export const dynamic = "force-static";

const publicRooms: RoomCardData[] = [
  { id: "1", roomName: "طاولة النخبة", creator: "سلطان", difficulty: "ELITE", maxPlayers: 6, filled: 5, mode: "AUTO", kind: "PUBLIC" },
  { id: "2", roomName: "سريعة ومثيرة", creator: "ناصر", difficulty: "MEDIUM", maxPlayers: 6, filled: 3, mode: "AUTO", kind: "PUBLIC" },
];
const friendsRooms: RoomCardData[] = [
  { id: "3", roomName: "طاولة الأصدقاء", creator: "فهد", difficulty: "EASY", maxPlayers: 4, filled: 2, mode: "MANUAL", kind: "FRIENDS" },
];

export default function RoomsPreview() {
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
