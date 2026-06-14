import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth, signOut } from "@/auth";

const MENU = [
  { href: "/rooms", icon: "♠", title: "إنشاء غرفة", desc: "ابدأ طاولة جديدة وادعُ أصدقاءك" },
  { href: "/rooms", icon: "♣", title: "دخول غرفة", desc: "انضمّ بكود دعوة أو من الغرف العامة" },
  { href: "/stats", icon: "📊", title: "الإحصائيات", desc: "مبارياتك ونسبة فوزك" },
  { href: "/bank", icon: "🏦", title: "البنك", desc: "اطلب 1000 كوين عند نفاد الرصيد" },
  { href: "/profile", icon: "👤", title: "الملف الشخصي", desc: "معلوماتك ورقمك التعريفي" },
];

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
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          فوتبول بوكر
        </div>
        <div className="row">
          <span className="pill gold">
            🪙 <span className="num">{balance}</span> كوين
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="btn btn-ghost">
              خروج
            </button>
          </form>
        </div>
      </header>

      <section className="card pad-lg" style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>أهلًا، {user?.username}</h1>
        <p className="muted">
          رقمك التعريفي <span className="num">#{user?.playerNumber}</span> — اختر وجهتك من القائمة.
        </p>
      </section>

      <nav className="menu-grid" aria-label="القائمة الرئيسية">
        {MENU.map((m) => (
          <Link key={m.title} href={m.href} className="menu-tile">
            <span className="icon" aria-hidden>
              {m.icon}
            </span>
            <h3>{m.title}</h3>
            <span className="muted small">{m.desc}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
