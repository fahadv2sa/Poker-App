import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      playerNumber: true,
      createdAt: true,
      wallet: { select: { balance: true, highestBalance: true } },
    },
  });
  if (!user) redirect("/login");

  const rows: Array<[string, string]> = [
    ["اسم المستخدم", user.username],
    ["الرقم التعريفي", `#${user.playerNumber}`],
    ["تاريخ التسجيل", new Date(user.createdAt).toLocaleDateString("ar")],
    ["الرصيد الحالي", `${user.wallet?.balance.toString() ?? "0"} كوين`],
    ["أعلى ثروة", `${user.wallet?.highestBalance.toString() ?? "0"} كوين`],
  ];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          الملف الشخصي
        </div>
        <Link href="/" className="btn btn-ghost">
          ← القائمة
        </Link>
      </header>

      <section className="card pad-lg stack">
        {rows.map(([k, v]) => (
          <div key={k} className="result-row">
            <span className="muted">{k}</span>
            <strong className="num" style={{ direction: "rtl" }}>
              {v}
            </strong>
          </div>
        ))}
        <p className="muted small">الإحصائيات التفصيلية والإنجازات تصل في المرحلة الخامسة.</p>
      </section>
    </main>
  );
}
