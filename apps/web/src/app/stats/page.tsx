import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <h2 className="text-xl">قريبًا</h2>
        <p className="text-muted-foreground">
          صفحة الإحصائيات الكاملة (المباريات، نسبة الفوز، الأرباح) تُبنى في المرحلة الخامسة.
        </p>
      </Card>
    </main>
  );
}
