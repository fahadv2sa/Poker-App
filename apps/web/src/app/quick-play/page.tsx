import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { signRealtimeToken } from "@/lib/realtime-token";
import { QuickPlay } from "@/components/quick-play";

export const dynamic = "force-dynamic";

export default async function QuickPlayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Identity-only realtime token (no gameId) — the same one tables use, here for
  // the matchmaking queue connection.
  const token = await signRealtimeToken({
    userId: session.user.id,
    username: session.user.name ?? "لاعب",
    playerNumber: session.user.playerNumber,
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          لعب سريع
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <QuickPlay token={token} />
    </main>
  );
}
