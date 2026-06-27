import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { ProfileScreen } from "@/components/games/profile-screen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Read-only values pulled from their canonical sources — never duplicated:
  // identity/nickname (users), balance (wallet), level + won/lost + biggest
  // win/loss (player_metrics). Avatar from user_avatars (else generated).
  const [user, metrics, avatar] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        nickname: true,
        playerNumber: true,
        avatarSeed: true,
        likesReceived: true,
        wallet: { select: { balance: true } },
      },
    }),
    prisma.playerMetrics.findUnique({
      where: { userId },
      select: { level: true, totalWon: true, totalLost: true, biggestWin: true, biggestLoss: true },
    }),
    prisma.userAvatar.findUnique({ where: { userId }, select: { updatedAt: true } }),
  ]);
  if (!user) redirect("/login");

  const k = (n: bigint | number) => `${n.toString()} كوين`;
  const rows: Array<[string, string]> = [
    ["عدد الكوينز", k(user.wallet?.balance ?? 0n)],
    ["إجمالي ربح الكوينز", k(metrics?.totalWon ?? 0n)],
    ["إجمالي خسارة الكوينز", k(metrics?.totalLost ?? 0n)],
    ["أكبر رهان رابح", k(metrics?.biggestWin ?? 0n)],
    ["أكبر رهان خاسر", k(metrics?.biggestLoss ?? 0n)],
  ];

  return (
    <ProfileScreen
      displayName={user.nickname ?? user.username}
      subtitle={`${user.username} · #${user.playerNumber}`}
      avatarUrl={avatar ? `/api/profile/avatar/${userId}?v=${avatar.updatedAt.getTime()}` : null}
      avatarSeed={user.avatarSeed ?? user.username}
      level={metrics?.level ?? 1}
      likes={user.likesReceived}
      rows={rows}
      currentNickname={user.nickname}
      hasAvatar={avatar != null}
    />
  );
}
