import Link from "next/link";
import { redirect } from "next/navigation";
import { getBankStatus, prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClaimButton } from "./claim-button";

export const dynamic = "force-dynamic";

export default async function BankPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [wallet, status] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    getBankStatus(userId),
  ]);

  const balance = wallet?.balance.toString() ?? "0";
  const resetText = status.nextResetAt
    ? new Date(status.nextResetAt).toLocaleString("ar")
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          البنك
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <Card className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">رصيدك الحالي</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-gold">
            🪙 <span className="num font-semibold">{balance}</span> كوين
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          عند نفاد الرصيد يمكنك طلب 1000 كوين من البنك، بحدّ أقصى مرتين كل 24 ساعة.
        </p>

        <div className="flex items-center justify-between rounded-lg border bg-secondary/40 p-4">
          <span>الطلبات المتاحة في هذه الفترة</span>
          <span className="num font-bold">
            {status.remaining} / 2
          </span>
        </div>

        <ClaimButton canClaim={status.remaining > 0} />

        {status.remaining === 0 && resetText ? (
          <p className="text-sm text-muted-foreground">
            يتجدّد طلب جديد في: <span className="num">{resetText}</span>
          </p>
        ) : null}
      </Card>
    </main>
  );
}
