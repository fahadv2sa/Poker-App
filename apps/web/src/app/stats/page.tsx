import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { deriveStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stats: true, wallet: { select: { highestBalance: true } } },
  });
  if (!user?.stats) redirect("/login");

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

  const tiles: Array<[string, string]> = [
    ["المباريات", String(s.gamesPlayed)],
    ["الانتصارات", String(s.wins)],
    ["الخسارات", String(s.losses)],
    ["نسبة الفوز", `${s.winRate}%`],
    ["مرات الانسحاب", String(s.folds)],
    ["إجمالي المكتسب", `${s.totalCoinsWon} كوين`],
    ["إجمالي المخسور", `${s.totalCoinsLost} كوين`],
    ["صافي الربح/الخسارة", `${s.netProfitLoss} كوين`],
  ];

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

      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {tiles.map(([label, value]) => (
          <Card key={label} className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="num text-lg font-bold">{value}</span>
          </Card>
        ))}
      </div>

      <Card className="p-6 sm:p-8">
        <h2 className="mb-4 text-xl">الإنجازات</h2>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {s.achievements.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-4",
                a.unlocked
                  ? "border-primary/45 bg-primary/5"
                  : "border-border bg-secondary/30 opacity-60",
              )}
            >
              <div className="flex items-center justify-between">
                <strong>{a.title}</strong>
                <span aria-hidden>{a.unlocked ? "🏆" : "🔒"}</span>
              </div>
              <span className="text-sm text-muted-foreground">{a.hint}</span>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
