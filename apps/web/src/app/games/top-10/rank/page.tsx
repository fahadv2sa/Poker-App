import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { BOT_PLAYER_NUMBER_BASE } from "@fb/shared";
import { auth } from "@/auth";
import { TenRankView, type TtRankedPlayer } from "@/components/top-10/TenRankView";

export const dynamic = "force-dynamic";
export const metadata = { title: "التصنيف — توب 10" };

const MAX_ROWS = 100;

/** Top Ten leaderboard — all human players ranked by their Top Ten level (XP
 *  tiebreak), exactly like Link Up's /rank. Bots are excluded (reserved
 *  player-number block; they also never get a ttProgression row). */
export default async function RankPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [users, progs] = await Promise.all([
    prisma.user.findMany({
      where: { playerNumber: { lt: BOT_PLAYER_NUMBER_BASE } },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarSeed: true,
        playerNumber: true,
        avatar: { select: { updatedAt: true } },
      },
    }),
    prisma.ttProgression.findMany({ select: { userId: true, level: true, xp: true } }),
  ]);
  const progById = new Map(progs.map((p) => [p.userId, p]));

  const ranked: TtRankedPlayer[] = users
    .map((u) => {
      const p = progById.get(u.id);
      return {
        id: u.id,
        name: u.nickname ?? u.username,
        playerNumber: u.playerNumber,
        level: p?.level ?? 1,
        xp: p ? Number(p.xp) : 0,
        avatarSrc: u.avatar ? `/api/profile/avatar/${u.id}?v=${u.avatar.updatedAt.getTime()}` : null,
        seed: u.avatarSeed ?? u.username,
      };
    })
    .sort((a, b) => b.level - a.level || b.xp - a.xp || a.playerNumber - b.playerNumber)
    .map((r, i) => ({ ...r, rank: i + 1, you: r.id === userId }));

  const top3 = ranked.slice(0, 3);
  const listed = ranked.slice(3, MAX_ROWS);
  const me = ranked.find((r) => r.you);
  const meBeyond = me && me.rank > MAX_ROWS;

  // Podium display order: 2nd · 1st · 3rd.
  const podiumOrder: Array<{ p: TtRankedPlayer; place: 1 | 2 | 3 }> = [];
  if (top3[1]) podiumOrder.push({ p: top3[1], place: 2 });
  if (top3[0]) podiumOrder.push({ p: top3[0], place: 1 });
  if (top3[2]) podiumOrder.push({ p: top3[2], place: 3 });

  return (
    <TenRankView
      podium={podiumOrder}
      listed={listed}
      pinnedMe={meBeyond && me ? me : null}
      empty={top3.length === 0}
    />
  );
}
