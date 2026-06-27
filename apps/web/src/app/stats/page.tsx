import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { deriveMetricView, type MetricCounters } from "@fb/shared";
import { auth } from "@/auth";
import { deriveStats } from "@/lib/stats";
import {
  StatsView,
  type StatBadge,
  type StatTile,
  type StatsVM,
} from "@/components/games/stats-view";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default async function StatsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Same data sources as before — only the presentation changes. The identity
  // (avatar/name) is read from the existing profile system (the one added read).
  const [user, metrics, badgeDefs, earned] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        nickname: true,
        avatarSeed: true,
        playerNumber: true,
        stats: true,
        wallet: { select: { highestBalance: true } },
        avatar: { select: { updatedAt: true } },
      },
    }),
    prisma.playerMetrics.findUnique({ where: { userId } }),
    prisma.badge.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.playerBadge.findMany({ where: { userId }, select: { badgeId: true } }),
  ]);
  if (!user?.stats) redirect("/login");
  const earnedIds = new Set(earned.map((e) => e.badgeId));

  const s = deriveStats({
    gamesPlayed: user.stats.gamesPlayed,
    wins: user.stats.wins,
    losses: user.stats.losses,
    folds: user.stats.folds,
    totalCoinsWon: user.stats.totalCoinsWon,
    totalCoinsLost: user.stats.totalCoinsLost,
    netProfitLoss: user.stats.netProfitLoss,
    highestBalance: user.wallet?.highestBalance ?? 0n,
  });

  const counters: MetricCounters | null = metrics
    ? {
        matches: metrics.matches,
        wins: metrics.wins,
        losses: metrics.losses,
        folds: metrics.folds,
        netProfit: Number(metrics.netProfit),
        showdownCount: metrics.showdownCount,
        bluffCount: metrics.bluffCount,
        bluffSuccessCount: metrics.bluffSuccessCount,
        weakWonCount: metrics.weakWonCount,
        betToPotSum: metrics.betToPotSum,
        betActionCount: metrics.betActionCount,
        luckSum: metrics.luckSum,
        luckRounds: metrics.luckRounds,
        biggestPot: Number(metrics.biggestPot),
        longestWinStreak: metrics.longestWinStreak,
      }
    : null;
  const view = counters ? deriveMetricView(counters) : null;

  const level = metrics?.level ?? 1;
  const xp = metrics ? Number(metrics.xp) : 0;
  // Display-only: how far into the current level (inverse of levelForXp = √(xp/50)+1).
  const xpAt = (lv: number) => 50 * (lv - 1) ** 2;
  const span = Math.max(1, xpAt(level + 1) - xpAt(level));
  const progress = clamp01((xp - xpAt(level)) / span);
  const xpToNext = Math.max(0, xpAt(level + 1) - xp);

  const displayName = user.nickname ?? user.username;
  const avatarSrc = user.avatar
    ? `/api/profile/avatar/${userId}?v=${user.avatar.updatedAt.getTime()}`
    : null;
  const hue = hueFromSeed(user.avatarSeed ?? user.username);

  const netNum = view ? view.net_profit : Number(user.stats.netProfitLoss);
  const core: StatTile[] = [
    { icon: "⚽", label: "المباريات", value: String(view ? view.matches : s.gamesPlayed), tone: "cream" },
    { icon: "🏆", label: "الانتصارات", value: String(view ? view.wins : s.wins), tone: "gold" },
    { icon: "💔", label: "الخسارات", value: String(view ? view.losses : s.losses), tone: "lose" },
    { icon: "🎯", label: "نسبة الفوز", value: view ? pct(view.win_rate) : `${s.winRate}%`, tone: "gold" },
    { icon: "🪙", label: "صافي الربح/الخسارة", value: `${netNum}`, tone: netNum >= 0 ? "gold" : "lose" },
    { icon: "🚪", label: "مرات الانسحاب", value: String(view ? view.folds : s.folds), tone: "cream" },
  ];

  const analysis = view
    ? {
        bars: [
          { label: "نجاح الخداع", r: clamp01(view.bluff_success_rate), display: pct(view.bluff_success_rate), tone: "gold" as const },
          { label: "معدّل الخداع", r: clamp01(view.bluff_rate), display: pct(view.bluff_rate), tone: "gold" as const },
          { label: "نسبة الوصول للكشف", r: clamp01(view.showdown_rate), display: pct(view.showdown_rate), tone: "gold" as const },
          { label: "نسبة الانسحاب", r: clamp01(view.fold_rate), display: pct(view.fold_rate), tone: "ember" as const },
          { label: "جرأة الرهان", r: clamp01(view.avg_bet_to_pot), display: pct(view.avg_bet_to_pot), tone: "gold" as const },
        ],
        luck: Math.max(-1, Math.min(1, view.luck_index)),
        biggestPot: String(view.biggest_pot),
        longestWinStreak: String(view.longest_win_streak),
      }
    : null;

  const badges: StatBadge[] = badgeDefs.map((b) => ({
    icon: b.icon,
    nameAr: b.nameAr,
    descAr: b.descriptionAr,
    unlocked: earnedIds.has(b.id),
  }));

  const vm: StatsVM = {
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
    badges,
  };

  return <StatsView vm={vm} />;
}
