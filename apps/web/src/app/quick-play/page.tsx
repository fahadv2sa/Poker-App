import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LuHeader, LuScreen } from "@/components/games/lu-screen";
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
    <LuScreen>
      <LuHeader icon={<span className="text-xl">⚡</span>} title="لعب سريع" subtitle="انضمّ لطاولة عشوائية فورًا" />
      <div className="mt-3">
        <QuickPlay token={token} />
      </div>
    </LuScreen>
  );
}
