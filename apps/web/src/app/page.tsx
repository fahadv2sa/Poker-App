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

  // Platform-level profile: identity (avatar/name) + social (likes/friends). Level/
  // XP live in each game's statistics; coins live inside each game. Never economy
  // here — the hub is shared across all games.
  const [user, avatar, friendCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, nickname: true, avatarSeed: true, likesReceived: true },
    }),
    prisma.userAvatar.findUnique({ where: { userId }, select: { updatedAt: true } }),
    prisma.friendship.count({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    }),
  ]);
  if (!user) redirect("/login");

  const displayName = user.nickname ?? user.username;
  const avatarUrl = avatar
    ? `/api/profile/avatar/${userId}?v=${avatar.updatedAt.getTime()}`
    : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);
  const initial = displayName.charAt(0).toUpperCase();
  const likes = user.likesReceived.toLocaleString("en-US");
  const friends = friendCount.toLocaleString("en-US");

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
      likes={likes}
      friends={friends}
      games={GAMES}
      logoutAction={logout}
    />
  );
}
