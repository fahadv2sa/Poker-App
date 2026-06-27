"use client";

import type { CardView, PlayerView } from "@fb/shared";
import { FootballCard, OpponentSeat, SeatAvatar } from "@/components/table/parts";

/**
 * PREVIEW ONLY — a STATIC reconstruction of the live-table look (gold-on-black),
 * with mock data and no socket. Lets the design be judged without a running
 * game-server. The real table is verified by playing a bot hand. Throwaway.
 */

const card = (playerId: string, name: string, nameAr: string, fame: number): CardView => ({
  playerId,
  name,
  nameAr,
  nationality: "الأرجنتين",
  position: "FWD",
  clubs: ["برشلونة", "إنتر ميامي"],
  photoUrl: null,
  fameScore: fame,
});

const player = (seat: number, username: string, status: PlayerView["status"], committed: number, dealer = false): PlayerView => ({
  seat,
  username,
  playerNumber: 1000 + seat,
  status,
  committedThisRound: committed,
  committedTotal: committed,
  isDealer: dealer,
});

const community = [
  card("c1", "L. Messi", "ميسي", 100),
  card("c2", "Neymar", "نيمار", 88),
  card("c3", "K. De Bruyne", "دي بروين", 86),
];
const hole = [card("h1", "Mohamed Salah", "محمد صلاح", 84), card("h2", "S. Mané", "ساديو ماني", 79)];
const opponents = [
  player(2, "سلطان", "ACTIVE", 150, true),
  player(3, "ناصر", "ALLIN", 520),
  player(4, "تركي", "FOLDED", 0),
  player(5, "ريان", "WAITING", 50),
];

export default function TablePreview() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col overflow-hidden bg-[var(--lu-abyss)] px-3 py-6">
      {/* opponents — top arc */}
      <div className="relative z-10 -mb-5 flex w-full max-w-3xl flex-nowrap items-end justify-center gap-1 self-center px-1 sm:-mb-7 sm:gap-3">
        {opponents.map((p, i) => {
          const offset = Math.round(Math.abs(i - (opponents.length - 1) / 2) * 6);
          return (
            <div key={p.seat} style={{ transform: `translateY(${offset}px)` }}>
              <OpponentSeat player={p} isActive={p.status === "ACTIVE"} deadlineTs={p.status === "ACTIVE" ? Date.now() + 42_000 : null} />
            </div>
          );
        })}
      </div>

      {/* felt */}
      <section
        className="lu-felt relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] border border-[var(--lu-gold-1)]/20 px-3 pb-3 pt-8 sm:gap-5 sm:rounded-[44px] sm:px-8 sm:pb-9 sm:pt-12"
        style={{ boxShadow: "inset 0 0 0 1px rgba(242,210,122,0.1), inset 0 0 70px rgba(0,0,0,0.55), 0 18px 50px rgba(0,0,0,0.5)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(255,106,26,0.18), transparent)" }}
        />

        <div className="relative flex flex-1 flex-col items-center justify-center gap-2 py-1 sm:gap-4 sm:py-2">
          <span
            aria-hidden
            className="lu-anim-pulse pointer-events-none absolute left-1/2 top-1/2 z-0 size-48 -translate-x-1/2 -translate-y-1/2 mix-blend-screen sm:size-64"
            style={{ backgroundImage: "url(/table-ring.png)", backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
          />
          <div className="glow-gold relative z-10 flex flex-col items-center gap-0.5 rounded-2xl border border-[var(--lu-gold-1)]/40 bg-[#0b0908]/80 px-7 py-2 shadow-lg backdrop-blur">
            <span className="text-[0.58rem] font-bold tracking-[0.25em] text-gold/70">المجمّع</span>
            <span className="num text-3xl font-black leading-none text-gold">1,240</span>
            <span className="text-[0.66rem] text-white/55">الرهان <span className="num">150</span></span>
          </div>

          <div className="flex flex-nowrap justify-center gap-1 sm:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <FootballCard key={i} index={i} card={community[i] ?? null} back={!community[i]} widthClass="w-[58px] sm:w-[118px]" />
            ))}
          </div>
        </div>

        <section className="relative z-10 flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 text-[0.7rem] text-white/75 sm:text-xs">
            <span>بطاقتاك</span>
            <span className="grid size-4 place-items-center rounded-full bg-white text-[0.6rem] font-black text-black">D</span>
            <span className="text-gold">· رهانك 🪙 <span className="num">150</span></span>
          </div>
          <div className="flex justify-center gap-2 sm:gap-3">
            {hole.map((c, i) => (
              <FootballCard key={c.playerId} card={c} index={i} size="lg" />
            ))}
          </div>
        </section>
      </section>

      {/* HUD */}
      <div className="mx-auto mt-1.5 flex w-full max-w-3xl shrink-0 items-stretch justify-center gap-2 sm:mt-3">
        <div className="flex min-w-[4.25rem] flex-col items-center justify-center rounded-2xl border border-[var(--lu-gold-1)]/45 bg-[var(--lu-gold-2)]/10 px-2.5 py-1 text-[var(--lu-gold-1)] sm:min-w-[5.25rem]">
          <span className="text-[0.55rem] font-bold opacity-75">رصيدي</span>
          <span className="num text-sm font-black sm:text-lg">🪙 4,850</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--lu-ember-glow)]/50 bg-[#0b0908]/75 px-3 py-1.5 lu-glow-ember backdrop-blur">
          <SeatAvatar playerNumber={1001} seed="me" size={34} sizeClass="size-9 sm:size-10" className="ring-2 ring-[var(--lu-ember-glow)]" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-bold sm:text-sm">أنت</span>
            <span className="text-[0.62rem] font-bold text-[var(--lu-ember-glow)] sm:text-xs">دورك…</span>
          </div>
        </div>
        <div className="flex min-w-[4.25rem] flex-col items-center justify-center rounded-2xl border border-[var(--lu-gold-1)]/50 bg-[var(--lu-gold-2)]/10 px-2.5 py-1 text-[var(--lu-gold-1)] sm:min-w-[5.25rem]">
          <span className="text-[0.55rem] font-bold opacity-75">صافي</span>
          <span className="num text-sm font-black sm:text-lg">▲ 420</span>
        </div>
      </div>

      {/* action bar (mock) */}
      <div className="mx-auto mt-2 w-full max-w-3xl shrink-0 sm:mt-5">
        <div className="rounded-2xl border bg-card/85 p-2 shadow-2xl backdrop-blur sm:p-4">
          <div className="flex flex-col gap-1.5 sm:gap-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-bold text-[var(--lu-ember-glow)]">دورك</span>
              <span className="text-muted-foreground">للمساواة: 🪙 <span className="num font-semibold text-foreground">150</span></span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button className="h-8 rounded-md bg-[var(--lu-gold-2)] px-2 text-xs font-bold text-black sm:h-9 sm:text-sm">مساواة <span className="num">150</span></button>
              <button className="h-8 rounded-md border border-[var(--lu-ember)]/50 bg-[var(--lu-ember)]/15 px-2 text-xs font-bold text-[var(--lu-ember-glow)] sm:h-9 sm:text-sm">كل الرصيد</button>
              <button className="h-8 rounded-md bg-destructive px-2 text-xs font-bold text-white sm:h-9 sm:text-sm">انسحاب</button>
            </div>
            <div className="flex items-center gap-2">
              <input readOnly placeholder="الحد الأدنى 200" className="num h-8 flex-1 rounded-md border border-input bg-transparent px-3 text-sm sm:h-9" />
              <button className="btn-gold-cta h-8 shrink-0 rounded-md px-3 text-xs font-bold text-black sm:h-9 sm:text-sm">رفع</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
