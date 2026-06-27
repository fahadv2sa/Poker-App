import Link from "next/link";
import { ClaimButton } from "@/app/bank/claim-button";
import { LuScreen } from "./lu-screen";
import { MuteButton } from "./mute-button";
import { BackIcon, BankIcon, CoinIcon, GuideIcon, HomeIcon, SettingsIcon } from "./lu-icons";

/**
 * Bank — gold-on-black, matched to the approved V0 layout (docs/DESIGN_BRIEF.md
 * §8): centered top bar, a hero balance panel with the gold-fire COIN medallion
 * above the balance, the daily-reward claim, a daily-limit row, the recent-ops
 * list, and the bottom nav. Pure presentation: pre-formatted values arrive as
 * props; the ClaimButton island keeps the claim logic unchanged.
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
  claimedToday,
  resetText,
  history,
}: {
  balance: string;
  amount: string;
  claimedToday: boolean;
  resetText: string;
  history: BankHistoryRow[];
}) {
  return (
    <LuScreen className="pb-28">
      {/* top bar — back (right) · centered title · mute (left) */}
      <header className="relative flex items-center justify-between gap-3 pt-1">
        <Link href="/games/link-up" aria-label="رجوع" className="lu-btn lu-frame grid size-10 place-items-center rounded-xl">
          <BackIcon size={20} />
        </Link>
        <h1 className="lu-gold-text lu-gold-title pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-black tracking-tight">
          البنك
        </h1>
        <MuteButton />
      </header>

      {/* hero balance panel — COIN medallion above the balance */}
      <section
        className="lu-frame mt-5 flex flex-col items-center gap-2 rounded-3xl px-6 pb-6 pt-7 text-center"
        style={{ background: "radial-gradient(120% 90% at 50% -6%, rgba(255,106,26,0.16), transparent 62%), linear-gradient(180deg, rgba(30,26,19,0.92), rgba(11,10,9,0.96))" }}
      >
        {/* gold bank-building medallion — centered icon with the ember glow ring
            + breathing pulse around it. */}
        <div className="relative grid place-items-center">
          <span
            aria-hidden
            className="lu-anim-pulse absolute size-44 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,106,26,0.42), rgba(255,106,26,0.12) 46%, transparent 70%)" }}
          />
          <span className="lu-anim-breathe relative size-28 overflow-hidden rounded-full ring-1 ring-[var(--lu-gold-1)]/40 shadow-[0_10px_34px_rgba(255,106,26,0.4)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bank-icon.png" alt="" className="absolute inset-0 size-full object-cover" />
          </span>
        </div>

        <span className="num lu-gold-text lu-gold-title mt-2 inline-flex items-center gap-2 text-5xl font-black leading-none">
          {balance}
          <CoinIcon size={22} />
        </span>
        <span className="text-sm text-[var(--lu-tan)]">رصيدك الحالي</span>
      </section>

      {/* daily reward claim (real logic island) */}
      <div className="mt-4">
        <ClaimButton amount={amount} claimedToday={claimedToday} />
      </div>

      {/* daily-limit row */}
      <div className="lu-frame mt-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5">
        <span className="flex items-center gap-3">
          <span className="lu-chip grid size-9 place-items-center rounded-xl ring-1 ring-[var(--lu-gold-1)]/30">
            <BankIcon size={18} />
          </span>
          <span className="text-sm font-bold text-[var(--lu-cream)]">المطالبات اليومية</span>
        </span>
        <span className="text-xs text-[var(--lu-tan)]">
          {claimedToday ? (
            <>التجديد <span className="num font-semibold text-[var(--lu-cream)]">{resetText}</span></>
          ) : (
            <span className="text-[var(--lu-ember-glow)]">متاحة الآن</span>
          )}
        </span>
      </div>

      {/* recent operations */}
      <h2 className="mb-2 mt-6 text-sm font-bold text-[var(--lu-tan)]">آخر العمليات</h2>
      {history.length === 0 ? (
        <div className="lu-frame flex flex-col items-center gap-2 rounded-2xl py-8 text-center">
          <span className="lu-chip grid size-12 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/20">
            <CoinIcon size={22} />
          </span>
          <p className="text-[var(--lu-tan)]">لا توجد عمليات بعد.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((h, i) => (
            <div key={`${h.when}-${i}`} className="lu-frame flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="lu-chip grid size-9 place-items-center rounded-xl ring-1 ring-[var(--lu-gold-1)]/30">
                  <CoinIcon size={18} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-bold text-[var(--lu-cream)]">مكافأة يومية</span>
                  <span className="num text-[0.7rem] text-[var(--lu-tan)]">{h.when}</span>
                </span>
              </span>
              <span className="num lu-gold-text text-base font-black">+{h.amount}</span>
            </div>
          ))}
        </div>
      )}

      {/* bottom nav */}
      <BankBottomNav />
    </LuScreen>
  );
}

function BankBottomNav() {
  const items = [
    { label: "الإعدادات", href: "/profile", Icon: SettingsIcon, active: false },
    { label: "الرئيسية", href: "/games/link-up", Icon: HomeIcon, active: true },
    { label: "دليل اللعب", href: "/guide", Icon: GuideIcon, active: false },
  ];
  return (
    <nav
      aria-label="التنقل"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[30rem] px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3"
    >
      <div className="lu-frame flex items-stretch justify-between gap-2 rounded-2xl px-3 py-2">
        {items.map(({ label, href, Icon, active }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className="group flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5"
          >
            <span
              className={
                active
                  ? "lu-chip grid size-10 place-items-center rounded-full shadow-[0_0_16px_rgba(255,106,26,0.4)] ring-1 ring-[var(--lu-ember-glow)]/60"
                  : "grid size-10 place-items-center rounded-full bg-black/25 ring-1 ring-[var(--lu-gold-1)]/20 group-hover:ring-[var(--lu-gold-1)]/45"
              }
            >
              <Icon size={20} />
            </span>
            <span className={active ? "lu-gold-text text-[11px] font-bold" : "text-[11px] font-bold text-[var(--lu-tan)]"}>
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
