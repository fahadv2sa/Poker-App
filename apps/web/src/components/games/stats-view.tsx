import { cn } from "@/lib/utils";
import { LuHeader, LuPanel, LuScreen } from "./lu-screen";
import { StatsIcon } from "./lu-icons";

/**
 * Stats dashboard — gold-on-black redesign (docs/DESIGN_BRIEF.md §8). Pure
 * presentation: the page derives every metric and passes a view-model. Stat /
 * badge glyphs are kept as the existing emoji for now (a later polish swaps them
 * for custom gold icons).
 */
export type StatTile = { icon: string; label: string; value: string; tone: "cream" | "gold" | "lose" };
export type StatBar = { label: string; r: number; display: string; tone: "gold" | "ember" };
export type StatBadge = { icon: string; nameAr: string; descAr: string; unlocked: boolean };
export type StatsVM = {
  displayName: string;
  playerNumber: number;
  avatarSrc: string | null;
  hue: number;
  level: number;
  xp: number;
  progress: number;
  xpToNext: number;
  core: StatTile[];
  analysis: { bars: StatBar[]; luck: number; biggestPot: string; longestWinStreak: string } | null;
  badges: StatBadge[];
};

const valueTone: Record<StatTile["tone"], string> = {
  cream: "text-[var(--lu-cream)]",
  gold: "lu-gold-text",
  lose: "text-[#d9694f]",
};

export function StatsView({ vm }: { vm: StatsVM }) {
  return (
    <LuScreen>
      <LuHeader icon={<StatsIcon size={22} />} title="الإحصائيات" subtitle="مستواك وأرقامك وشاراتك" />

      {/* identity + level ring */}
      <section
        className="lu-frame mt-3 rounded-3xl p-5"
        style={{ background: "radial-gradient(120% 120% at 0% 0%, rgba(255,106,26,0.12), transparent 55%), linear-gradient(180deg, rgba(30,26,19,0.92), rgba(11,10,9,0.96))" }}
      >
        <div className="flex items-center justify-between gap-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {vm.avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vm.avatarSrc} alt={vm.displayName} className="size-16 shrink-0 rounded-full object-cover ring-2 ring-[var(--lu-gold-1)]/50" />
            ) : (
              <div
                aria-hidden
                className="grid size-16 shrink-0 place-items-center rounded-full text-2xl font-black text-white ring-2 ring-[var(--lu-gold-1)]/50"
                style={{ background: `linear-gradient(135deg, hsl(${vm.hue} 70% 45%), hsl(${(vm.hue + 40) % 360} 70% 35%))` }}
              >
                {vm.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-2xl font-black leading-tight text-[var(--lu-cream)]">{vm.displayName}</div>
              <div className="num text-sm text-[var(--lu-tan)]">#{vm.playerNumber}</div>
            </div>
          </div>

          <div className="rank-ring shrink-0" style={{ ["--p" as string]: vm.progress * 360 }}>
            <div className="grid size-16 place-items-center">
              <div className="flex flex-col items-center leading-none">
                <span className="text-[0.5rem] tracking-[0.2em] text-[var(--lu-gold-1)]/70">LVL</span>
                <span className="num lu-gold-text text-2xl font-black">{vm.level}</span>
              </div>
            </div>
          </div>
        </div>

        {/* XP bar */}
        <div className="mt-5">
          <div className="mb-2 flex items-end justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[0.6rem] font-bold tracking-[0.18em] text-[var(--lu-gold-1)]/70">الإكس بي</span>
              <span className="num lu-gold-text text-xl font-black">{vm.xp.toLocaleString("en-US")}</span>
              <span className="text-xs font-bold text-[var(--lu-tan)]">XP</span>
            </div>
            <span className="num lu-chip rounded-full px-2.5 py-0.5 text-xs font-bold text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/30">
              {Math.round(vm.progress * 100)}%
            </span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full border border-white/10 bg-black/40">
            <div
              className="bar-fill h-full rounded-full"
              style={{
                width: `${vm.progress * 100}%`,
                background: "linear-gradient(90deg, var(--lu-gold-2), var(--lu-ember))",
                boxShadow: "0 0 12px rgba(255,106,26,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.72rem]">
            <span className="text-[var(--lu-tan)]">
              المستوى <span className="num font-bold text-[var(--lu-cream)]">{vm.level}</span>
            </span>
            <span className="text-[var(--lu-tan)]">
              تبقّى <span className="num lu-gold-text font-bold">{vm.xpToNext.toLocaleString("en-US")}</span> للمستوى{" "}
              <span className="num font-bold text-[var(--lu-cream)]">{vm.level + 1}</span>
            </span>
          </div>
        </div>
      </section>

      {/* core tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {vm.core.map((t) => (
          <div key={t.label} className="lu-frame flex flex-col gap-1 rounded-2xl p-4">
            <span aria-hidden className="text-xl">{t.icon}</span>
            <span className={cn("num text-3xl font-black leading-none", valueTone[t.tone])}>{t.value}</span>
            <span className="text-xs text-[var(--lu-tan)]">{t.label}</span>
          </div>
        ))}
      </div>

      {/* play-style analysis */}
      {vm.analysis ? (
        <LuPanel className="mt-5">
          <h2 className="mb-4 text-lg font-black text-[var(--lu-cream)]">تحليل أسلوب اللعب</h2>
          <div className="flex flex-col gap-3.5">
            {vm.analysis.bars.map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-[var(--lu-tan)]">{b.label}</span>
                  <span className="num font-bold text-[var(--lu-cream)]">{b.display}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="bar-fill h-full rounded-full"
                    style={{
                      width: `${b.r * 100}%`,
                      background: b.tone === "ember" ? "var(--lu-ember)" : "linear-gradient(90deg, var(--lu-gold-2), var(--lu-gold-1))",
                    }}
                  />
                </div>
              </div>
            ))}

            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-[var(--lu-tan)]">مؤشّر الحظ</span>
                <span className={cn("num font-bold", vm.analysis.luck >= 0 ? "lu-gold-text" : "text-[#d9694f]")}>
                  {vm.analysis.luck > 0 ? "+" : ""}
                  {vm.analysis.luck.toFixed(2)}
                </span>
              </div>
              <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, #b23a12, rgba(120,110,90,0.5), var(--lu-gold-1))" }}>
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                  style={{ left: `${((vm.analysis.luck + 1) / 2) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="lu-chip flex items-center gap-2 rounded-xl px-3 py-3 ring-1 ring-[var(--lu-gold-1)]/30">
              <span aria-hidden className="text-lg">🪙</span>
              <div className="flex flex-col leading-tight">
                <span className="num lu-gold-text text-lg font-black">{vm.analysis.biggestPot}</span>
                <span className="text-[0.7rem] text-[var(--lu-tan)]">أكبر مجمّع</span>
              </div>
            </div>
            <div className="lu-chip flex items-center gap-2 rounded-xl px-3 py-3 ring-1 ring-[var(--lu-ember)]/30">
              <span aria-hidden className="text-lg">🔥</span>
              <div className="flex flex-col leading-tight">
                <span className="num text-lg font-black text-[var(--lu-ember-glow)]">{vm.analysis.longestWinStreak}</span>
                <span className="text-[0.7rem] text-[var(--lu-tan)]">أطول سلسلة فوز</span>
              </div>
            </div>
          </div>
        </LuPanel>
      ) : null}

      {/* badges */}
      <LuPanel className="mt-5">
        <h2 className="mb-4 text-lg font-black text-[var(--lu-cream)]">الشارات</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {vm.badges.map((b) => (
            <div
              key={b.nameAr}
              className={cn(
                "relative flex flex-col items-center gap-1.5 rounded-2xl border p-4 text-center",
                b.unlocked
                  ? "badge-shine border-[var(--lu-gold-1)]/45 bg-gradient-to-b from-[var(--lu-gold-2)]/15 to-transparent shadow-[0_0_18px_rgba(255,106,26,0.16)]"
                  : "border-white/10 bg-black/20",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-12 place-items-center rounded-full text-2xl",
                  b.unlocked ? "bg-[var(--lu-gold-1)]/15" : "bg-white/5 opacity-40 grayscale",
                )}
              >
                {b.icon}
              </span>
              <strong className={cn("text-sm", b.unlocked ? "text-[var(--lu-cream)]" : "text-[var(--lu-tan)]")}>{b.nameAr}</strong>
              <span className="text-[0.7rem] leading-snug text-[var(--lu-tan)]">{b.descAr}</span>
              <span
                className={cn(
                  "mt-0.5 rounded-full px-2 py-0.5 text-[0.6rem] font-bold",
                  b.unlocked ? "text-[var(--lu-gold-1)] ring-1 ring-[var(--lu-gold-1)]/40" : "bg-white/5 text-[var(--lu-tan)]",
                )}
              >
                {b.unlocked ? "★ مفتوحة" : "🔒 مقفلة"}
              </span>
            </div>
          ))}
        </div>
      </LuPanel>
    </LuScreen>
  );
}
