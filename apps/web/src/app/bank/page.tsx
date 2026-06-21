import { redirect } from "next/navigation";
import { getBankStatus, prisma } from "@fp/db";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
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
    <main className="relative mx-auto max-w-3xl overflow-hidden px-4 pb-6 sm:px-6 sm:pb-10 page-top">
      <div aria-hidden className="arena-rail" />

      <PageHeader icon="🏦" title="البنك" subtitle="رصيدك وطلبات الكوين" accent="gold" />

      {/* Vault — the balance is the hero of this page. */}
      <div className="fade-rise relative z-10 mb-4 flex flex-col items-center gap-1 rounded-2xl border border-gold/25 p-7 text-center shadow-[0_18px_42px_rgba(0,0,0,0.42)] [background:radial-gradient(120%_90%_at_50%_-10%,color-mix(in_oklch,var(--gold)_16%,transparent),transparent_60%),color-mix(in_oklch,var(--background)_70%,var(--card))]">
        <span className="text-[0.7rem] font-bold tracking-[0.2em] text-gold/80">رصيدك الحالي</span>
        <span className="num text-5xl font-black leading-none text-gold">{balance}</span>
        <span className="text-sm text-gold/80">كوين 🪙</span>
      </div>

      <Panel className="relative z-10 flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          عند نفاد الرصيد يمكنك طلب 1000 كوين من البنك، بحدّ أقصى مرتين كل 24 ساعة.
        </p>

        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-secondary/30 p-4">
          <span>الطلبات المتاحة في هذه الفترة</span>
          <span className="num font-bold text-primary">{status.remaining} / 2</span>
        </div>

        <ClaimButton canClaim={status.remaining > 0} />

        {status.remaining === 0 && resetText ? (
          <p className="text-sm text-muted-foreground">
            يتجدّد طلب جديد في: <span className="num">{resetText}</span>
          </p>
        ) : null}
      </Panel>
    </main>
  );
}
