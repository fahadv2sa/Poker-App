import { ClaimButton } from "@/app/bank/claim-button";
import { LuHeader, LuPanel, LuScreen } from "./lu-screen";
import { BankIcon, CoinIcon } from "./lu-icons";

/**
 * Bank — gold-on-black redesign (docs/DESIGN_BRIEF.md §8). Pure presentation:
 * pre-formatted values arrive as props (formatting + DB stay in the page), and
 * the existing ClaimButton island carries the claim logic unchanged.
 */
export type BankHistoryRow = {
  when: string;
  amount: string;
  balanceAfter: string;
  level: number | null;
};

export function BankView({
  balance,
  amount,
  level,
  claimedToday,
  resetText,
  history,
}: {
  balance: string;
  amount: string;
  level: number;
  claimedToday: boolean;
  resetText: string;
  history: BankHistoryRow[];
}) {
  return (
    <LuScreen>
      <LuHeader icon={<BankIcon size={22} />} title="البنك" subtitle="مكافأتك اليومية وسجلّ السحوبات" />

      {/* Vault — the balance is the hero of this page. */}
      <div
        className="lu-frame mb-4 mt-3 flex flex-col items-center gap-1 rounded-3xl p-7 text-center"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(255,106,26,0.14), transparent 60%), linear-gradient(180deg, rgba(30,26,19,0.92), rgba(11,10,9,0.96))" }}
      >
        <span className="text-[0.7rem] font-bold tracking-[0.2em] text-[var(--lu-tan)]">رصيدك الحالي</span>
        <span className="num lu-gold-text lu-gold-title text-5xl font-black leading-none">{balance}</span>
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--lu-tan)]">
          <CoinIcon size={16} /> كوين
        </span>
      </div>

      {/* Daily claim */}
      <LuPanel className="mb-4 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm text-[var(--lu-tan)]">مكافأة اليوم</span>
            <span className="num lu-gold-text lu-gold-title text-3xl font-black">
              {amount} <span className="text-base font-bold text-[var(--lu-tan)]">كوين</span>
            </span>
          </div>
          <span className="lu-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/35">
            ⭐ المستوى <span className="num">{level}</span>
          </span>
        </div>

        <p className="text-xs leading-relaxed text-[var(--lu-tan)]">
          تحصل يوميًا على <span className="font-bold text-[var(--lu-cream)]">المستوى × 1000</span> كوين، مرّة
          واحدة كل يوم. تتجدّد المكافأة عند منتصف الليل بتوقيت الرياض.
        </p>

        <ClaimButton amount={amount} claimedToday={claimedToday} />

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
          <span className="text-[var(--lu-tan)]">{claimedToday ? "تم سحب مكافأة اليوم ✓" : "متاحة الآن"}</span>
          <span className="text-[var(--lu-tan)]">
            التجديد: <span className="num font-semibold text-[var(--lu-cream)]">{resetText}</span>
          </span>
        </div>
      </LuPanel>

      {/* Claim history */}
      <LuPanel>
        <h2 className="mb-4 text-lg font-bold text-[var(--lu-cream)]">سجلّ السحوبات</h2>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="lu-chip grid size-12 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/20">
              <CoinIcon size={22} />
            </span>
            <p className="text-[var(--lu-tan)]">لا توجد سحوبات بعد.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-white/10 pb-2 text-xs text-[var(--lu-tan)] sm:grid">
              <span>التاريخ</span>
              <span className="text-end">المبلغ</span>
              <span className="text-end">الرصيد بعدها</span>
              <span className="text-end">المستوى</span>
            </div>
            {history.map((h, i) => (
              <div
                key={`${h.when}-${i}`}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-1 border-b border-white/[0.06] py-2.5 text-sm last:border-0 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <span className="num text-xs text-[var(--lu-tan)] sm:text-sm">{h.when}</span>
                <span className="num lu-gold-text text-end font-bold">+{h.amount}</span>
                <span className="num text-end text-[var(--lu-tan)]">{h.balanceAfter}</span>
                <span className="num text-end">
                  {h.level != null ? (
                    <span className="rounded-full px-2 py-0.5 text-xs text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/30">
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
      </LuPanel>
    </LuScreen>
  );
}
