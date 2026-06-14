import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
        <div className="flex flex-col">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-b border-border/60 py-3 last:border-0">
              <span className="text-muted-foreground">{k}</span>
              <strong className="num">{v}</strong>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          الإحصائيات التفصيلية والإنجازات تصل في المرحلة الخامسة.
        </p>
      </Card>
    </main>
  );
}
