import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { levelForXp, levelProgress } from "@fb/top-10-engine";
import { auth } from "@/auth";
import { TenStatsView, type TtMilestone, type TtStatTile, type TtStatsVM } from "@/components/top-10/TenStatsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإحصائيات — توب 10" };

/** Deterministic gradient hue for the generated avatar fallback (same approach as
 *  the rank/profile views — a tiny local copy, no shared export). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Real Top Ten metrics from the top_10 schema: progression (xp/level/matches/wins),
  // per-match points (sum/best), and personal reveals (cards + rank-10 "الأندر").
  const [user, prog, pointsAgg, cardsRevealed, valuableReveals, rarestReveals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        nickname: true,
        avatarSeed: true,
        playerNumber: true,
        avatar: { select: { updatedAt: true } },
      },
    }),
    prisma.ttProgression.findUnique({ where: { userId } }),
    prisma.ttMatchPlayer.aggregate({ where: { userId }, _sum: { totalPoints: true }, _max: { totalPoints: true } }),
    prisma.ttRoundReveal.count({ where: { revealedByUserId: userId } }),
    prisma.ttRoundReveal.count({ where: { revealedByUserId: userId, rank: { gte: 8 } } }),
    prisma.ttRoundReveal.count({ where: { revealedByUserId: userId, rank: 10 } }),
  ]);
  if (!user) redirect("/login");

  const xp = Number(prog?.xp ?? 0n);
  const level = prog?.level ?? levelForXp(xp);
  const matches = prog?.matchesPlayed ?? 0;
  const wins = prog?.matchesWon ?? 0;
  const winRate = matches > 0 ? wins / matches : 0;
  const totalPoints = pointsAgg._sum.totalPoints ?? 0;
  const bestMatch = pointsAgg._max.totalPoints ?? 0;
  const avgPoints = matches > 0 ? Math.round(totalPoints / matches) : 0;
  const valuableRate = cardsRevealed > 0 ? valuableReveals / cardsRevealed : 0;

  const prg = levelProgress(xp);
  const progress = prg.levelSpan > 0 ? Math.min(1, prg.intoLevel / prg.levelSpan) : 0;
  const xpToNext = Math.max(0, prg.levelSpan - prg.intoLevel);

  const displayName = user.nickname ?? user.username;
  const avatarSrc = user.avatar ? `/api/profile/avatar/${userId}?v=${user.avatar.updatedAt.getTime()}` : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);

  const core: TtStatTile[] = [
    { icon: "⚽", label: "المباريات", value: String(matches), tone: "cream" },
    { icon: "🏆", label: "الانتصارات", value: String(wins), tone: "gold" },
    { icon: "🎯", label: "نسبة الفوز", value: `${Math.round(winRate * 100)}%`, tone: "gold" },
    { icon: "⭐", label: "إجمالي النقاط", value: totalPoints.toLocaleString("en-US"), tone: "gold" },
    { icon: "🃏", label: "البطاقات المكشوفة", value: String(cardsRevealed), tone: "cream" },
    { icon: "💎", label: "كشوف الأندر", value: String(rarestReveals), tone: "gold" },
  ];

  const analysis = {
    bars: [
      { label: "نسبة الفوز", r: Math.max(0, Math.min(1, winRate)), display: `${Math.round(winRate * 100)}%`, tone: "gold" as const },
      { label: "نسبة كشف الأثمن", r: Math.max(0, Math.min(1, valuableRate)), display: `${Math.round(valuableRate * 100)}%`, tone: "gold" as const },
    ],
    bestMatch: bestMatch.toLocaleString("en-US"),
    avgPoints: avgPoints.toLocaleString("en-US"),
  };

  // Milestones — unlock states derived from the real metrics above (no fabricated data).
  const milestones: TtMilestone[] = [
    { icon: "⚽", nameAr: "أول مباراة", descAr: "العب مباراتك الأولى", unlocked: matches >= 1 },
    { icon: "🏆", nameAr: "أول فوز", descAr: "افز بمباراة واحدة", unlocked: wins >= 1 },
    { icon: "🃏", nameAr: "كاشف", descAr: "اكشف ١٠ بطاقات", unlocked: cardsRevealed >= 10 },
    { icon: "💎", nameAr: "صائد الأندر", descAr: "اكشف بطاقة المركز ١٠", unlocked: rarestReveals >= 1 },
    { icon: "🔥", nameAr: "قنّاص", descAr: "سجّل ٣٠ نقطة بمباراة", unlocked: bestMatch >= 30 },
    { icon: "🧠", nameAr: "خبير", descAr: "ابلغ المستوى ١٠", unlocked: level >= 10 },
  ];

  const vm: TtStatsVM = {
    displayName,
    playerNumber: user.playerNumber,
    avatarSrc,
    hue,
    level,
    xp,
    progress,
    xpToNext,
    core,
    analysis,
    milestones,
  };

  return <TenStatsView vm={vm} />;
}
