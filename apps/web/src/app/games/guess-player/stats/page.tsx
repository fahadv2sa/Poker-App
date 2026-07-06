import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { gpLevelForXp, gpLevelProgress } from "@fb/guess-player-engine";
import { auth } from "@/auth";
// TenStatsView is a purely presentational stats sheet (tiles + bars +
// milestones) — reused as-is; promoting it to a shared package is a later
// cleanup shaped by this second consumer.
import { TenStatsView, type TtMilestone, type TtStatTile, type TtStatsVM } from "@/components/top-10/TenStatsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإحصائيات — خمن اللاعب" };

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Real metrics from the guess_player schema: progression + per-match points
  // + detective work (questions asked, correct guesses, fastest solve).
  const [user, prog, pointsAgg, questionsAsked, correctGuesses] = await Promise.all([
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
    prisma.gpProgression.findUnique({ where: { userId } }),
    prisma.gpMatchPlayer.aggregate({ where: { userId }, _sum: { totalPoints: true }, _max: { totalPoints: true } }),
    prisma.gpQuestion.count({ where: { askerUserId: userId } }),
    prisma.gpGuess.count({ where: { guesserUserId: userId, correct: true } }),
  ]);
  if (!user) redirect("/login");

  const xp = Number(prog?.xp ?? 0n);
  const level = prog?.level ?? gpLevelForXp(xp);
  const matches = prog?.matchesPlayed ?? 0;
  const wins = prog?.matchesWon ?? 0;
  const roundsWon = prog?.roundsWon ?? 0;
  const winRate = matches > 0 ? wins / matches : 0;
  const totalPoints = pointsAgg._sum.totalPoints ?? 0;
  const bestMatch = pointsAgg._max.totalPoints ?? 0;
  const avgPoints = matches > 0 ? Math.round(totalPoints / matches) : 0;

  const prg = gpLevelProgress(xp);
  const progress = prg.levelSpan > 0 ? Math.min(1, prg.intoLevel / prg.levelSpan) : 0;
  const xpToNext = Math.max(0, prg.levelSpan - prg.intoLevel);

  const displayName = user.nickname ?? user.username;
  const avatarSrc = user.avatar ? `/api/profile/avatar/${userId}?v=${user.avatar.updatedAt.getTime()}` : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);

  const core: TtStatTile[] = [
    { icon: "⚽", label: "المباريات", value: String(matches), tone: "cream" },
    { icon: "🏆", label: "الانتصارات", value: String(wins), tone: "gold" },
    { icon: "🕵️", label: "جولات كشفتها", value: String(roundsWon), tone: "gold" },
    { icon: "⭐", label: "إجمالي النقاط", value: totalPoints.toLocaleString("en-US"), tone: "gold" },
    { icon: "❓", label: "أسئلة طرحتها", value: String(questionsAsked), tone: "cream" },
    { icon: "🎯", label: "تخمينات صحيحة", value: String(correctGuesses), tone: "gold" },
  ];

  const analysis = {
    bars: [
      { label: "نسبة الفوز", r: Math.max(0, Math.min(1, winRate)), display: `${Math.round(winRate * 100)}%`, tone: "gold" as const },
      {
        label: "كفاءة التحقيق",
        r: questionsAsked > 0 ? Math.max(0, Math.min(1, correctGuesses / Math.max(1, questionsAsked / 5))) : 0,
        display: questionsAsked > 0 ? `${correctGuesses}/${questionsAsked} سؤال` : "—",
        tone: "gold" as const,
      },
    ],
    bestMatch: bestMatch.toLocaleString("en-US"),
    avgPoints: avgPoints.toLocaleString("en-US"),
  };

  const milestones: TtMilestone[] = [
    { icon: "⚽", nameAr: "أول مباراة", descAr: "العب مباراتك الأولى", unlocked: matches >= 1 },
    { icon: "🎯", nameAr: "أول كشف", descAr: "خمّن لاعبًا خفيًا واحدًا", unlocked: correctGuesses >= 1 },
    { icon: "🏆", nameAr: "أول فوز", descAr: "افز بمباراة واحدة", unlocked: wins >= 1 },
    { icon: "❓", nameAr: "محقق", descAr: "اطرح ٥٠ سؤالًا", unlocked: questionsAsked >= 50 },
    { icon: "🕵️", nameAr: "عين الصقر", descAr: "اكشف ١٠ جولات", unlocked: roundsWon >= 10 },
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
