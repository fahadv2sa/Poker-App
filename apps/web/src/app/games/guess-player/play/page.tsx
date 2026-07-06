import { redirect } from "next/navigation";
import { GP_DIFFICULTIES, GP_LIMITS, GP_MODES, type GpDifficulty, type GpMode } from "@fb/shared";
import { auth } from "@/auth";
// The realtime token IS the cross-game identity contract (same AUTH_SECRET,
// same claims) — minting is shared platform infrastructure, not a Top Ten
// internal, so it is reused as-is.
import { signRealtimeToken } from "@/lib/top-10/realtime-token";
import { GuessPlayerClient } from "@/components/guess-player/GuessPlayerClient";

export const dynamic = "force-dynamic";

/** The realtime play surface (quick-play lobby + live match). Deep links:
 *    ?join=CODE                                → auto-join a room by code
 *    ?create=1&mode&difficulty&private&max&name → auto-create a room */
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{
    join?: string;
    create?: string;
    mode?: string;
    difficulty?: string;
    private?: string;
    name?: string;
    max?: string;
  }>;
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
  const mode: GpMode = (GP_MODES as readonly string[]).includes(sp.mode ?? "")
    ? (sp.mode as GpMode)
    : "VS_SYSTEM";
  const difficulty = (GP_DIFFICULTIES as readonly string[]).includes(sp.difficulty ?? "")
    ? (sp.difficulty as GpDifficulty)
    : "MEDIUM";
  const isPrivate = sp.private === "1";
  const roomName = sp.name?.trim().slice(0, 40) || undefined;
  const maxPlayers = Math.min(
    GP_LIMITS.maxPlayers,
    Math.max(GP_LIMITS.minPlayers, Number(sp.max) || GP_LIMITS.maxPlayers),
  );
  const autoCreate =
    sp.create === "1"
      ? {
          mode,
          difficulty: mode === "VS_SYSTEM" ? difficulty : undefined,
          isPrivate,
          roomName,
          maxPlayers,
        }
      : null;

  return (
    <GuessPlayerClient
      token={token}
      me={{ userId: session.user.id, username: session.user.name ?? "player" }}
      autoJoinCode={autoJoinCode}
      autoCreate={autoCreate}
    />
  );
}
