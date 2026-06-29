import { redirect } from "next/navigation";
import { TT_DIFFICULTIES, type TtDifficulty } from "@fb/shared";
import { auth } from "@/auth";
import { signRealtimeToken } from "@/lib/top-10/realtime-token";
import { TopTenClient } from "@/components/top-10/TopTenClient";

export const dynamic = "force-dynamic";

/** The realtime play surface (quick-play lobby + live match). Reached from the
 *  home hero (quick play) and deep-linked from /create-room and /rooms:
 *    ?join=CODE              → auto-join a room by code
 *    ?create=1&difficulty&minutes&private → auto-create a manual room (no bots);
 *                              private=1 keeps it off the rooms list (code-only) */
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string; create?: string; difficulty?: string; minutes?: string; private?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const token = await signRealtimeToken({
    userId: session.user.id,
    username: session.user.name ?? "player",
    playerNumber: session.user.playerNumber ?? 0,
  });

  const sp = await searchParams;
  const autoJoinCode = sp.join?.trim().toUpperCase() || undefined;
  const difficulty = (TT_DIFFICULTIES as readonly string[]).includes(sp.difficulty ?? "")
    ? (sp.difficulty as TtDifficulty)
    : "MEDIUM";
  const minutes = Math.min(30, Math.max(1, Number(sp.minutes) || 10));
  const isPrivate = sp.private === "1";
  const autoCreate = sp.create === "1" ? { difficulty, minutes, isPrivate } : null;

  return (
    <TopTenClient
      token={token}
      me={{ userId: session.user.id, username: session.user.name ?? "player" }}
      autoJoinCode={autoJoinCode}
      autoCreate={autoCreate}
    />
  );
}
