import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { deriveMetricView, type MetricCounters } from "@fp/shared";
import { auth } from "@/auth";
import { BackButton } from "@/components/back-button";
import { cn } from "@/lib/utils";
import { deriveStats } from "@/lib/stats";

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
  const core = [
    { icon: "⚽", label: "المباريات", value: String(view ? view.matches : s.gamesPlayed), tone: "text-foreground", edge: "border-t-white/25" },
    { icon: "🏆", label: "الانتصارات", value: String(view ? view.wins : s.wins), tone: "text-primary", edge: "border-t-primary/70" },
    { icon: "💔", label: "الخسارات", value: String(view ? view.losses : s.losses), tone: "text-destructive", edge: "border-t-destructive/70" },
    { icon: "🎯", label: "نسبة الفوز", value: view ? pct(view.win_rate) : `${s.winRate}%`, tone: "text-accent", edge: "border-t-accent/70" },
    { icon: "🪙", label: "صافي الربح/الخسارة", value: `${netNum}`, tone: netNum >= 0 ? "text-gold" : "text-destructive", edge: netNum >= 0 ? "border-t-gold/70" : "border-t-destructive/70" },
    { icon: "🚪", label: "مرات الانسحاب", value: String(view ? view.folds : s.folds), tone: "text-muted-foreground", edge: "border-t-white/15" },
  ];

  const bars = view
    ? [
        { label: "نجاح الخداع", r: clamp01(view.bluff_success_rate), display: pct(view.bluff_success_rate), color: "bg-primary" },
        { label: "معدّل الخداع", r: clamp01(view.bluff_rate), display: pct(view.bluff_rate), color: "bg-accent" },
        { label: "نسبة الوصول للكشف", r: clamp01(view.showdown_rate), display: pct(view.showdown_rate), color: "bg-accent" },
        { label: "نسبة الانسحاب", r: clamp01(view.fold_rate), display: pct(view.fold_rate), color: "bg-destructive" },
        { label: "جرأة الرهان", r: clamp01(view.avg_bet_to_pot), display: pct(view.avg_bet_to_pot), color: "bg-gold" },
      ]
    : [];
  const luck = view ? Math.max(-1, Math.min(1, view.luck_index)) : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-6 sm:px-6 sm:pb-10 page-top">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          الإحصائيات
        </div>
        <BackButton />
      </header>

      {/* ── Identity + rank emblem (the hero) ─────────────────────────────── */}
      <section
        className="relative mb-5 overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-6"
        style={{
          background:
            "radial-gradient(120% 120% at 0% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in oklch, var(--primary) 7%, transparent), transparent), var(--card)",
        }}
      >
        <div className="flex items-center justify-between gap-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt={displayName} className="size-16 shrink-0 rounded-full object-cover ring-2 ring-accent/60" />
            ) : (
              <div
                className="grid size-16 shrink-0 place-items-center rounded-full text-2xl font-black text-white ring-2 ring-accent/60"
                style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
                aria-hidden
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              {/* truncate a long name so the level/XP emblem never wraps to the next line */}
              <div className="truncate text-2xl font-black leading-tight">{displayName}</div>
              <div className="num text-sm text-muted-foreground">#{user.playerNumber}</div>
            </div>
          </div>

          {/* level emblem — the XP progress also traces the ring around it */}
          <div className="rank-ring shrink-0" style={{ ["--p" as string]: progress * 360 }}>
            <div className="grid size-16 place-items-center">
              <div className="flex flex-col items-center leading-none">
                <span className="text-[0.5rem] tracking-[0.2em] text-gold/70">LVL</span>
                <span className="num text-2xl font-black text-gold">{level}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── XP progress toward the next level — premium labeled bar ───────── */}
        <div className="mt-5">
          <div className="mb-2 flex items-end justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[0.6rem] font-bold tracking-[0.18em] text-gold/70">الإكس بي</span>
              <span className="num text-xl font-black text-gold">{xp.toLocaleString("en-US")}</span>
              <span className="text-xs font-bold text-muted-foreground">XP</span>
            </div>
            <span className="num rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs font-bold text-gold">
              {Math.round(progress * 100)}%
            </span>
          </div>

          <div
            className="relative h-3 overflow-hidden rounded-full border border-white/10"
            style={{ background: "color-mix(in oklch, var(--background) 55%, var(--card))" }}
          >
            <div
              className="bar-fill h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                background: "linear-gradient(90deg, var(--primary), var(--accent))",
                boxShadow:
                  "0 0 12px color-mix(in oklch, var(--primary) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[0.72rem]">
            <span className="text-muted-foreground">
              المستوى <span className="num font-bold text-foreground">{level}</span>
            </span>
            <span className="text-muted-foreground">
              تبقّى <span className="num font-bold text-gold">{xpToNext.toLocaleString("en-US")}</span>{" "}
              للمستوى <span className="num font-bold text-foreground">{level + 1}</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Core stats — lively tiles ─────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {core.map((t) => (
          <div
            key={t.label}
            className={cn(
              "flex flex-col gap-1 rounded-2xl border border-t-[3px] border-white/10 bg-card/70 p-4 transition hover:-translate-y-0.5",
              t.edge,
            )}
          >
            <div className="flex items-center justify-between">
              <span aria-hidden className="text-xl">{t.icon}</span>
            </div>
            <span className={cn("num text-3xl font-black leading-none", t.tone)}>{t.value}</span>
            <span className="text-xs text-muted-foreground">{t.label}</span>
          </div>
        ))}
      </div>

      {/* ── Play-style analysis ───────────────────────────────────────────── */}
      {view ? (
        <section className="mb-5 rounded-2xl border border-white/10 bg-card/70 p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-black">تحليل أسلوب اللعب</h2>

          <div className="flex flex-col gap-3.5">
            {bars.map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="num font-bold">{b.display}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/8">
                  <div className={cn("bar-fill h-full rounded-full", b.color)} style={{ width: `${b.r * 100}%` }} />
                </div>
              </div>
            ))}

            {/* luck meter (−/+) */}
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">مؤشّر الحظ</span>
                <span className={cn("num font-bold", luck >= 0 ? "text-primary" : "text-destructive")}>
                  {luck > 0 ? "+" : ""}
                  {luck.toFixed(2)}
                </span>
              </div>
              <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--destructive), color-mix(in oklch, var(--muted) 60%, transparent), var(--primary))" }}>
                <span className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${((luck + 1) / 2) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* highlight chips */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-3">
              <span aria-hidden className="text-lg">🪙</span>
              <div className="flex flex-col leading-tight">
                <span className="num text-lg font-black text-gold">{view.biggest_pot}</span>
                <span className="text-[0.7rem] text-muted-foreground">أكبر مجمّع</span>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-3">
              <span aria-hidden className="text-lg">🔥</span>
              <div className="flex flex-col leading-tight">
                <span className="num text-lg font-black text-primary">{view.longest_win_streak}</span>
                <span className="text-[0.7rem] text-muted-foreground">أطول سلسلة فوز</span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Badges — rewarding ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-card/70 p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-black">الشارات</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {badgeDefs.map((b) => {
            const unlocked = earnedIds.has(b.id);
            return (
              <div
                key={b.id}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 rounded-2xl border p-4 text-center transition",
                  unlocked
                    ? "badge-shine border-gold/45 bg-gradient-to-b from-gold/15 to-card shadow-[0_0_18px_rgba(212,175,55,0.18)]"
                    : "border-white/10 bg-secondary/20",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-12 place-items-center rounded-full text-2xl",
                    unlocked ? "bg-gold/15" : "bg-white/5 opacity-40 grayscale",
                  )}
                >
                  {b.icon}
                </span>
                <strong className={cn("text-sm", !unlocked && "text-muted-foreground")}>{b.nameAr}</strong>
                <span className="text-[0.7rem] leading-snug text-muted-foreground">{b.descriptionAr}</span>
                <span
                  className={cn(
                    "mt-0.5 rounded-full px-2 py-0.5 text-[0.6rem] font-bold",
                    unlocked ? "bg-gold/20 text-gold" : "bg-white/5 text-muted-foreground",
                  )}
                >
                  {unlocked ? "★ مفتوحة" : "🔒 مقفلة"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
