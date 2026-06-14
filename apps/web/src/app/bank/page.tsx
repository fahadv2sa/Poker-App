import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function BankPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          البنك
        </div>
        <Link href="/" className="btn btn-ghost">
          ← القائمة
        </Link>
      </header>
      <section className="card pad-lg center stack">
        <h2>قريبًا</h2>
        <p className="muted">
          طلب 1000 كوين (بحد أقصى مرتين كل 24 ساعة) يُفعّل في المرحلة الخامسة.
        </p>
      </section>
    </main>
  );
}
