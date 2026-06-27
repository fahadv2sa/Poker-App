import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { BANK_CLAIM_PER_LEVEL, BOT_PLAYER_NUMBER_BASE, INSTALL_REWARD_AMOUNT } from "@fb/shared";
import { auth } from "@/auth";
import { InstallRewardModal } from "@/components/install-reward-modal";
import { LevelUpModal } from "@/components/level-up-modal";
import { RoomClosedNotice } from "@/components/room-closed-notice";
import { LinkUpHome } from "@/components/games/link-up-home";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Set when redirected here from a closed/ABANDONED table link (see table page).
  const roomClosed = (await searchParams).closed === "1";

  // Game-scoped data only — the platform profile (avatar/name/likes/friends) moved
  // to the hub (/) and the wallet balance lives on the Bank page (/bank). Here we
  // need the install-reward flag and level/XP (for the global rank + the level-up
  // celebration). Level/XP are shown in /stats.
  const [user, metrics] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        installRewardAt: true,
      },
    }),
    prisma.playerMetrics.findUnique({
      where: { userId },
      select: { level: true, xp: true, celebratedLevel: true },
    }),
  ]);
  if (!user) redirect("/login");

  // Global rank = position among all HUMAN players by LEVEL (XP tiebreak; bots
  // excluded) — matches the /rank leaderboard the tile opens. One cheap count.
  const myLevel = metrics?.level ?? 1;
  const myXp = metrics?.xp ?? 0n;
  const rankNum =
    (await prisma.playerMetrics.count({
      where: {
        user: { playerNumber: { lt: BOT_PLAYER_NUMBER_BASE } },
        OR: [{ level: { gt: myLevel } }, { level: myLevel, xp: { gt: myXp } }],
      },
    })) + 1;

  const rank = `#${rankNum.toLocaleString("en-US")}`;
  // One-time "add to home screen" reward state (server-authoritative flag).
  const installRewardClaimed = user.installRewardAt != null;
  const installRewardAmount = Number(INSTALL_REWARD_AMOUNT).toLocaleString("en-US");
  // Level-up celebration: pending when the current level is above the highest
  // already-celebrated level (both server-authoritative). Shows the FINAL new
  // level + the new daily bank amount (level × 1000).
  const levelNum = metrics?.level ?? 1;
  const leveledUp = levelNum > (metrics?.celebratedLevel ?? 1);
  const dailyBankAmount = (Number(BANK_CLAIM_PER_LEVEL) * levelNum).toLocaleString("en-US");

  // Visual layer = the redesigned gold-on-black home (docs/DESIGN_BRIEF.md §8).
  // All data/logic is unchanged: the computed rank is passed in, and the
  // server-authoritative modals render alongside it exactly as before.
  return (
    <>
      <LinkUpHome rank={rank} />

      {/* Level-up celebration (takes priority over the install prompt; on a
          higher z-index). Server-authoritative; only mounted when pending. */}
      {leveledUp ? <LevelUpModal newLevel={levelNum} dailyBank={dailyBankAmount} /> : null}

      {/* One-time "add to home screen" reward — shows only in a browser tab to
          users who haven't claimed; the reward is granted server-side. */}
      <InstallRewardModal claimed={installRewardClaimed} amount={installRewardAmount} />

      {/* Redirected here from a closed/ABANDONED table link → brief notice. */}
      {roomClosed ? <RoomClosedNotice /> : null}
    </>
  );
}
