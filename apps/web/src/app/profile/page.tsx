import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Deterministic hue from the avatar seed → a simple generated avatar (no I/O). */
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      playerNumber: true,
      avatarSeed: true,
      createdAt: true,
      wallet: { select: { balance: true, highestBalance: true } },
      stats: { select: { netProfitLoss: true } },
    },
  });
  if (!user) redirect("/login");

  const seed = user.avatarSeed ?? user.username;
  const hue = hueFromSeed(seed);
  const initial = user.username.charAt(0).toUpperCase();

  const rows: Array<[string, string]> = [
    ["اسم المستخدم", user.username],
    ["الرقم التعريفي", `#${user.playerNumber}`],
    ["تاريخ التسجيل", new Date(user.createdAt).toLocaleDateString("ar")],
    ["الرصيد الحالي", `${user.wallet?.balance.toString() ?? "0"} كوين`],
    ["أعلى ثروة", `${user.wallet?.highestBalance.toString() ?? "0"} كوين`],
    ["صافي الربح/الخسارة", `${user.stats?.netProfitLoss.toString() ?? "0"} كوين`],
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          الملف الشخصي
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-4">
          <div
            className="grid size-16 place-items-center rounded-full text-2xl font-black text-white"
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))`,
            }}
            aria-hidden
          >
            {initial}
          </div>
          <div>
            <div className="text-lg font-bold">{user.username}</div>
            <div className="num text-sm text-muted-foreground">#{user.playerNumber}</div>
          </div>
        </div>

        <div className="flex flex-col">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between border-b border-border/60 py-3 last:border-0"
            >
              <span className="text-muted-foreground">{k}</span>
              <strong className="num">{v}</strong>
            </div>
          ))}
        </div>

        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link href="/stats">عرض الإحصائيات الكاملة →</Link>
        </Button>
      </Card>
    </main>
  );
}
