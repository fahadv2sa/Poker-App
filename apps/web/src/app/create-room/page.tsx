import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { CreateRoomForm } from "./create-form";

/** Create a room (name, difficulty, resolve mode, max players, private toggle).
 *  Joining by invite code lives on the join-room screen (/rooms). */
export default async function CreateRoomPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="relative mx-auto max-w-xl overflow-hidden px-4 py-6 sm:px-6 sm:py-10">
      <div aria-hidden className="arena-rail" />

      <PageHeader icon="♠" title="إنشاء غرفة" subtitle="ابدأ طاولة جديدة وادعُ أصدقاءك" />

      <Panel accent className="relative z-10">
        <CreateRoomForm />
      </Panel>
    </main>
  );
}
