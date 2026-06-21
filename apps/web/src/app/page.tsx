import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { CoinPill } from "@/components/coin-pill";
import { cn } from "@/lib/utils";

const MENU = [
  { href: "/quick-play", icon: "⚡", title: "لعب سريع", desc: "انضمّ لطاولة عشوائية فورًا دون إنشاء غرفة", accent: "primary" },
  { href: "/create-room", icon: "♠", title: "إنشاء غرفة", desc: "ابدأ طاولة جديدة وادعُ أصدقاءك", accent: "primary" },
  { href: "/rooms", icon: "♣", title: "دخول غرفة", desc: "انضمّ بكود دعوة أو من الغرف العامة", accent: "cyan" },
  { href: "/stats", icon: "📊", title: "الإحصائيات", desc: "مبارياتك ونسبة فوزك", accent: "cyan" },
  { href: "/bank", icon: "🏦", title: "البنك", desc: "اطلب 1000 كوين عند نفاد الرصيد", accent: "gold" },
  { href: "/profile", icon: "👤", title: "الملف الشخصي", desc: "معلوماتك ورقمك التعريفي", accent: "cyan" },
  { href: "/friends", icon: "🤝", title: "الأصدقاء", desc: "قائمة أصدقائك وإدارتهم", accent: "primary" },
  { href: "/guide", icon: "📖", title: "كيف تلعب", desc: "دليل الترابطات وطريقة اللعب والشارات في مكان واحد", accent: "gold" },
] as const;

const CHIP: Record<string, string> = {
  primary: "bg-primary/14 border-primary/30",
  cyan: "bg-accent/14 border-accent/28",
  gold: "bg-gold/14 border-gold/30",
};

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, playerNumber: true, wallet: { select: { balance: true } } },
  });
  const balance = user?.wallet?.balance.toString() ?? "0";

  return (
    <main className="relative mx-auto max-w-5xl overflow-hidden px-4 py-6 sm:px-6 sm:py-10">
      <div aria-hidden className="arena-rail" />

      <header className="relative z-10 mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xl font-black">
          <Logo className="size-9" />
          فوتبول بي
        </div>
        <div className="flex items-center gap-3">
          <CoinPill amount={balance} />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost">
              خروج
            </Button>
          </form>
        </div>
      </header>

      <section className="panel fade-rise relative z-10 mb-6 flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:gap-6 sm:p-8 sm:text-right">
        <Logo glow className="size-24 shrink-0 sm:size-28" />
        <div>
          <h1 className="mb-1 text-2xl">
            أهلًا، {user?.username} في <span className="text-primary">فوتبول بي</span>
          </h1>
          <p className="text-muted-foreground">
            رقمك التعريفي <span className="num">#{user?.playerNumber}</span> — اختر وجهتك من القائمة.
          </p>
        </div>
      </section>

      <nav
        aria-label="القائمة الرئيسية"
        className="relative z-10 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
      >
        {MENU.map((m) => (
          <Link
            key={m.title}
            href={m.href}
            className="tile flex min-h-[124px] flex-col gap-2.5 p-5"
          >
            <span className={cn("tile-ico", CHIP[m.accent])} aria-hidden>
              {m.icon}
            </span>
            <h3 className="text-lg font-bold">{m.title}</h3>
            <span className="text-sm leading-snug text-muted-foreground">{m.desc}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
