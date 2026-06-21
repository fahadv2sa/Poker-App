import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
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
    <main className="relative mx-auto max-w-3xl overflow-hidden px-4 pb-6 sm:px-6 sm:pb-10 page-top">
      <div aria-hidden className="arena-rail" />

      <PageHeader icon="⚡" title="لعب سريع" subtitle="انضمّ لطاولة عشوائية فورًا" />

      <div className="relative z-10">
        <QuickPlay token={token} />
      </div>
    </main>
  );
}
