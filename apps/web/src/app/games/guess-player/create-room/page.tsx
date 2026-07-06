import { redirect } from "next/navigation";
import { CreateRoomIcon } from "@fb/top-10-ui";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/guess-player/lu-screen";
import { CreateRoomForm } from "./create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "إنشاء غرفة — خمن اللاعب" };

/** Create a manual room. VS_HUMANS (picker mode) lives ONLY here — quick play
 *  is always vs the system (locked rule). */
export default async function CreateRoomPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <LuScreen>
      <LuHeader icon={<CreateRoomIcon size={22} />} title="إنشاء غرفة" subtitle="ابدأ طاولة جديدة وادعُ أصدقاءك" />
      <LuPanel className="mt-3">
        <CreateRoomForm />
      </LuPanel>
    </LuScreen>
  );
}
