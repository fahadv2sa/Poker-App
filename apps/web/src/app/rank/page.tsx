import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { BOT_PLAYER_NUMBER_BASE } from "@fb/shared";
import { auth } from "@/auth";
import { RankView, type RankedPlayer } from "@/components/games/rank-view";

export const dynamic = "force-dynamic";

const MAX_ROWS = 100;

export default async function RankPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // ALL human players (bots excluded) + their level/xp from the existing metrics
  // read model. Sorted by level (XP tiebreak) — the same ordering as the home
  // rank badge. Current scale is small; cap the rendered list and pin self below.
  const users = await prisma.user.findMany({
    where: { playerNumber: { lt: BOT_PLAYER_NUMBER_BASE } },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarSeed: true,
      playerNumber: true,
      metrics: { select: { level: true, xp: true } },
      avatar: { select: { updatedAt: true } },
    },
  });

  const ranked: RankedPlayer[] = users
    .map((u) => ({
      id: u.id,
      name: u.nickname ?? u.username,
      playerNumber: u.playerNumber,
      level: u.metrics?.level ?? 1,
      xp: u.metrics ? Number(u.metrics.xp) : 0,
      avatarSrc: u.avatar ? `/api/profile/avatar/${u.id}?v=${u.avatar.updatedAt.getTime()}` : null,
      seed: u.avatarSeed ?? u.username,
    }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp || a.playerNumber - b.playerNumber)
    .map((r, i) => ({ ...r, rank: i + 1, you: r.id === userId }));

  const top3 = ranked.slice(0, 3);
  const listed = ranked.slice(3, MAX_ROWS);
  const me = ranked.find((r) => r.you);
  const meBeyond = me && me.rank > MAX_ROWS;

  // Podium display order: 2nd · 1st · 3rd.
  const podiumOrder: Array<{ p: RankedPlayer; place: 1 | 2 | 3 }> = [];
  if (top3[1]) podiumOrder.push({ p: top3[1], place: 2 });
  if (top3[0]) podiumOrder.push({ p: top3[0], place: 1 });
  if (top3[2]) podiumOrder.push({ p: top3[2], place: 3 });

  return (
    <RankView
      podium={podiumOrder}
      listed={listed}
      pinnedMe={meBeyond && me ? me : null}
      empty={top3.length === 0}
    />
  );
}
