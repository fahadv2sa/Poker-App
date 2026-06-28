import { redirect } from "next/navigation";
import { CreateRoomIcon } from "@fb/top-10-ui";
import { auth } from "@/auth";
import { LuHeader, LuPanel, LuScreen } from "@/components/lu-screen";
import { CreateRoomForm } from "./create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "إنشاء غرفة — توب 10" };

/** Create a manual room — ISOLATED from quick play (manual rooms never get bots).
 *  Public rooms are listed on the join page; private rooms are reachable only by
 *  invite link / room code. Mirrors Link Up's create-room. */
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
