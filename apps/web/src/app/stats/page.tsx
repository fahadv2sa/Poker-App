import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { deriveMetricView, type MetricCounters } from "@fp/shared";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { deriveStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function StatsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [user, metrics, badgeDefs, earned] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { stats: true, wallet: { select: { highestBalance: true } } },
    }),
    prisma.playerMetrics.findUnique({ where: { userId } }),
    prisma.badge.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.playerBadge.findMany({ where: { userId }, select: { badgeId: true } }),
  ]);
  if (!user?.stats) redirect("/login");
  const earnedIds = new Set(earned.map((e) => e.badgeId));

  // Basics: prefer the precomputed metrics; fall back to legacy UserStats so the
  // page always works even before the first post-match aggregation has run.
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

  const basicTiles: Array<[string, string]> = [
    ["المباريات", String(view ? view.matches : s.gamesPlayed)],
    ["الانتصارات", String(view ? view.wins : s.wins)],
    ["الخسارات", String(view ? view.losses : s.losses)],
    ["نسبة الفوز", view ? pct(view.win_rate) : `${s.winRate}%`],
    ["مرات الانسحاب", String(view ? view.folds : s.folds)],
    ["صافي الربح/الخسارة", `${view ? view.net_profit : s.netProfitLoss} كوين`],
  ];

  const behavioralTiles: Array<[string, string]> = view
    ? [
        ["نسبة الوصول للكشف", pct(view.showdown_rate)],
        ["نسبة الانسحاب", pct(view.fold_rate)],
        ["معدّل الخداع", pct(view.bluff_rate)],
        ["نجاح الخداع", pct(view.bluff_success_rate)],
        ["جرأة الرهان (مقابل المجمّع)", pct(view.avg_bet_to_pot)],
        ["مؤشّر الحظ", view.luck_index.toFixed(2)],
        ["أكبر مجمّع", `${view.biggest_pot} كوين`],
        ["أطول سلسلة فوز", String(view.longest_win_streak)],
      ]
    : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          الإحصائيات
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      {/* Level / XP (Layer 4) */}
      <Card className="mb-6 flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full border border-gold/50 bg-gold/10 text-lg font-black text-gold">
            {level}
          </span>
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">المستوى</span>
            <span className="num text-lg font-bold">
              {xp} <span className="text-sm font-normal text-muted-foreground">XP</span>
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">يعكس المهارة لا عدد المباريات فقط</span>
      </Card>

      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {basicTiles.map(([label, value]) => (
          <Card key={label} className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="num text-lg font-bold">{value}</span>
          </Card>
        ))}
      </div>

      {behavioralTiles.length > 0 ? (
        <Card className="mb-6 p-6 sm:p-8">
          <h2 className="mb-4 text-xl">تحليل أسلوب اللعب</h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {behavioralTiles.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 rounded-lg border bg-secondary/30 p-4">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="num text-lg font-bold">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Badges (Layer 3, data-driven) */}
      <Card className="p-6 sm:p-8">
        <h2 className="mb-4 text-xl">الشارات</h2>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {badgeDefs.map((b) => {
            const unlocked = earnedIds.has(b.id);
            return (
              <div
                key={b.id}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-4",
                  unlocked ? "border-primary/45 bg-primary/5" : "border-border bg-secondary/30 opacity-60",
                )}
              >
                <div className="flex items-center justify-between">
                  <strong>
                    <span aria-hidden className="me-1">
                      {b.icon}
                    </span>
                    {b.nameAr}
                  </strong>
                  <span aria-hidden>{unlocked ? "🏆" : "🔒"}</span>
                </div>
                <span className="text-sm text-muted-foreground">{b.descriptionAr}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
