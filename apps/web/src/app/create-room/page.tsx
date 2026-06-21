import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateRoomForm } from "./create-form";

/** Create a room (name, difficulty, resolve mode, max players, private toggle).
 *  Joining by invite code lives on the join-room screen (/rooms). */
export default async function CreateRoomPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          إنشاء غرفة
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <Card className="p-6 sm:p-8">
        <h2 className="mb-4 text-xl">إنشاء غرفة</h2>
        <CreateRoomForm />
      </Card>
    </main>
  );
}
