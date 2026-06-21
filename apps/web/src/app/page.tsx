import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

const MENU = [
  { href: "/quick-play", icon: "⚡", title: "لعب سريع", desc: "انضمّ لطاولة عشوائية فورًا دون إنشاء غرفة" },
  { href: "/create-room", icon: "♠", title: "إنشاء غرفة", desc: "ابدأ طاولة جديدة وادعُ أصدقاءك" },
  { href: "/rooms", icon: "♣", title: "دخول غرفة", desc: "انضمّ بكود دعوة أو من الغرف العامة" },
  { href: "/stats", icon: "📊", title: "الإحصائيات", desc: "مبارياتك ونسبة فوزك" },
  { href: "/bank", icon: "🏦", title: "البنك", desc: "اطلب 1000 كوين عند نفاد الرصيد" },
  { href: "/profile", icon: "👤", title: "الملف الشخصي", desc: "معلوماتك ورقمك التعريفي" },
  { href: "/friends", icon: "🤝", title: "الأصدقاء", desc: "قائمة أصدقائك وإدارتهم" },
  { href: "/guide", icon: "📖", title: "دليل الترابطات", desc: "تعرف على جميع ترابطات اللعبة وشروط تحققها" },
];

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [user, badges] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, playerNumber: true, wallet: { select: { balance: true } } },
    }),
    prisma.badge.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const balance = user?.wallet?.balance.toString() ?? "0";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          فوتبول بي
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm text-gold">
            🪙 <span className="num font-semibold">{balance}</span> كوين
          </span>
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

      <section className="mb-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-2xl">أهلًا، {user?.username}</h1>
        <p className="text-muted-foreground">
          رقمك التعريفي <span className="num">#{user?.playerNumber}</span> — اختر وجهتك من القائمة.
        </p>
      </section>

      <nav
        aria-label="القائمة الرئيسية"
        className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
      >
        {MENU.map((m) => (
          <Link
            key={m.title}
            href={m.href}
            className="flex min-h-[120px] flex-col gap-2 rounded-xl border bg-linear-to-b from-card to-secondary p-6 transition hover:-translate-y-1 hover:border-primary/45 hover:shadow-xl"
          >
            <span className="text-2xl" aria-hidden>
              {m.icon}
            </span>
            <h3 className="text-lg font-bold">{m.title}</h3>
            <span className="text-sm text-muted-foreground">{m.desc}</span>
          </Link>
        ))}
      </nav>

      {/* Badges intro — data-driven from the badges table (Layer 3). Add a badge
          row and this card updates automatically, no code change. */}
      {badges.length > 0 ? (
        <section className="mt-8 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="mb-1 text-xl font-bold">الشارات</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            شارات تُمنح تلقائيًا حسب أسلوب لعبك — إليك معنى كلٍّ منها وكيف تكسبها:
          </p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {badges.map((b) => (
              <div key={b.id} className="flex items-start gap-3 rounded-lg border bg-secondary/30 p-4">
                <span className="text-2xl" aria-hidden>
                  {b.icon}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold">{b.nameAr}</span>
                  <span className="text-sm leading-snug text-muted-foreground">{b.descriptionAr}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
