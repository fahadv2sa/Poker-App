import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth, signOut } from "@/auth";
import { GAMES } from "@/lib/games";
import { PlatformHub } from "@/components/games/platform-hub";

export const dynamic = "force-dynamic";

/** Deterministic gradient hue for the generated avatar fallback (same approach as
 *  the profile/lobby — a tiny local copy, no shared export). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default async function HubPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Platform-level profile: identity only (avatar/name). Likes/friends still live
  // in the system but are no longer surfaced on the hub. Level/XP live in each
  // game's statistics; coins live inside each game. Never economy here — the hub
  // is shared across all games.
  const [user, avatar] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, nickname: true, avatarSeed: true },
    }),
    prisma.userAvatar.findUnique({ where: { userId }, select: { updatedAt: true } }),
  ]);
  if (!user) redirect("/login");

  const displayName = user.nickname ?? user.username;
  const avatarUrl = avatar
    ? `/api/profile/avatar/${userId}?v=${avatar.updatedAt.getTime()}`
    : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);
  const initial = displayName.charAt(0).toUpperCase();

  // Reuses the existing sign-out server action (same as the game lobby).
  const logout = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <PlatformHub
      displayName={displayName}
      avatarUrl={avatarUrl}
      hue={hue}
      initial={initial}
      games={GAMES}
      logoutAction={logout}
    />
  );
}
