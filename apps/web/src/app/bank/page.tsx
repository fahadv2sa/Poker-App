import { redirect } from "next/navigation";
import { getBankStatus, getBankHistory, prisma } from "@fb/db";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { ClaimButton } from "./claim-button";

export const dynamic = "force-dynamic";

/** Format a UTC instant in the bank's reference timezone (Asia/Riyadh). */
function riyadhDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
function riyadhTime(d: Date): string {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function BankPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [wallet, status, history] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    getBankStatus(userId),
    getBankHistory(userId, 20),
  ]);

  const balance = wallet?.balance.toString() ?? "0";
  const amount = status.amount.toString();
  const resetText = riyadhTime(status.nextResetAt);

  return (
    <main className="relative mx-auto max-w-3xl overflow-hidden px-4 pb-6 sm:px-6 sm:pb-10 page-top">
      <div aria-hidden className="arena-rail" />

      <PageHeader icon="🏦" title="البنك" subtitle="مكافأتك اليومية وسجلّ السحوبات" accent="gold" />

      {/* Vault — the balance is the hero of this page. */}
      <div className="fade-rise relative z-10 mb-4 flex flex-col items-center gap-1 rounded-2xl border border-gold/25 p-7 text-center shadow-[0_18px_42px_rgba(0,0,0,0.42)] [background:radial-gradient(120%_90%_at_50%_-10%,color-mix(in_oklch,var(--gold)_16%,transparent),transparent_60%),color-mix(in_oklch,var(--background)_70%,var(--card))]">
        <span className="text-[0.7rem] font-bold tracking-[0.2em] text-gold/80">رصيدك الحالي</span>
        <span className="num text-5xl font-black leading-none text-gold">{balance}</span>
        <span className="text-sm text-gold/80">كوين 🪙</span>
      </div>

      {/* Daily claim card */}
      <Panel className="relative z-10 mb-4 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">مكافأة اليوم</span>
            <span className="num text-3xl font-black text-gold">
              {amount} <span className="text-base font-bold text-gold/70">كوين</span>
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-bold text-gold">
            ⭐ المستوى <span className="num">{status.level}</span>
          </span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          تحصل يوميًا على <span className="font-bold text-foreground">المستوى × 1000</span> كوين، مرّة
          واحدة كل يوم. تتجدّد المكافأة عند منتصف الليل بتوقيت الرياض.
        </p>

        <ClaimButton amount={amount} claimedToday={status.claimedToday} />

        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-secondary/30 p-3 text-sm">
          <span className="text-muted-foreground">
            {status.claimedToday ? "تم سحب مكافأة اليوم ✓" : "متاحة الآن"}
          </span>
          <span className="text-muted-foreground">
            التجديد: <span className="num font-semibold text-foreground">{resetText}</span>
          </span>
        </div>
      </Panel>

      {/* Persisted, per-user claim history */}
      <Panel className="relative z-10">
        <h2 className="mb-4 text-lg font-bold">سجلّ السحوبات</h2>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-3xl opacity-60" aria-hidden>🧾</span>
            <p className="text-muted-foreground">لا توجد سحوبات بعد.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* header row (desktop) */}
            <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-border/60 pb-2 text-xs text-muted-foreground sm:grid">
              <span>التاريخ</span>
              <span className="text-end">المبلغ</span>
              <span className="text-end">الرصيد بعدها</span>
              <span className="text-end">المستوى</span>
            </div>
            {history.map((h, i) => (
              <div
                key={`${h.claimedAt.toISOString()}-${i}`}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-1 border-b border-border/40 py-2.5 text-sm last:border-0 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <span className="num text-xs text-muted-foreground sm:text-sm">
                  {riyadhDateTime(h.claimedAt)}
                </span>
                <span className="num text-end font-bold text-gold">
                  +{h.amount.toString()}
                </span>
                <span className="num text-end text-muted-foreground">
                  {h.balanceAfter != null ? h.balanceAfter.toString() : "—"}
                </span>
                <span className="num text-end">
                  {h.level != null ? (
                    <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs text-gold">
                      ⭐ {h.level}
                    </span>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </main>
  );
}
