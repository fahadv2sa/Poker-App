import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/games/lu-screen";
import { CreateRoomForm } from "./create-form";

/** Create a room (name, difficulty, resolve mode, max players, private toggle).
 *  Joining by invite code lives on the join-room screen (/rooms). */
export default async function CreateRoomPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <LuScreen>
      <LuHeader icon={<span className="text-xl">♠</span>} title="إنشاء غرفة" subtitle="ابدأ طاولة جديدة وادعُ أصدقاءك" />
      <LuPanel className="mt-3">
        <CreateRoomForm />
      </LuPanel>
    </LuScreen>
  );
}
