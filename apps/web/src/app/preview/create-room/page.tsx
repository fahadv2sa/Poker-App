import { LuHeader, LuPanel, LuScreen } from "@/components/games/lu-screen";
import { CreateRoomForm } from "@/app/create-room/create-form";

/** PREVIEW ONLY — no auth; renders the create-room form. */
export const dynamic = "force-static";

export default function CreateRoomPreview() {
  return (
    <LuScreen>
      <LuHeader icon={<span className="text-xl">♠</span>} title="إنشاء غرفة" subtitle="ابدأ طاولة جديدة وادعُ أصدقاءك" />
      <LuPanel className="mt-3">
        <CreateRoomForm />
      </LuPanel>
    </LuScreen>
  );
}
