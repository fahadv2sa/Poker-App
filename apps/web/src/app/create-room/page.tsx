import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateRoomForm } from "./create-form";
import { JoinForm } from "./join-form";

/** Create a room, or join one by invite code. Both forms keep their existing
 *  logic/validation/API calls — they were only moved here from /rooms. */
export default async function CreateRoomPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          إنشاء غرفة
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Card className="p-6 sm:p-8">
          <h2 className="mb-4 text-xl">إنشاء غرفة</h2>
          <CreateRoomForm />
        </Card>
        <Card className="p-6 sm:p-8">
          <h2 className="mb-4 text-xl">دخول بكود</h2>
          <JoinForm />
        </Card>
      </div>
    </main>
  );
}
