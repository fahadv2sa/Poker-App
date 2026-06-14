import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          الإحصائيات
        </div>
        <Link href="/" className="btn btn-ghost">
          ← القائمة
        </Link>
      </header>
      <section className="card pad-lg center stack">
        <h2>قريبًا</h2>
        <p className="muted">
          صفحة الإحصائيات الكاملة (المباريات، نسبة الفوز، الأرباح) تُبنى في المرحلة الخامسة.
        </p>
      </section>
    </main>
  );
}
