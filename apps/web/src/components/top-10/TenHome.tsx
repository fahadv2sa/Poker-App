"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  Atmosphere,
  BackIcon,
  CreateRoomIcon,
  GoldGradientDefs,
  GuideIcon,
  HomeIcon,
  JoinRoomIcon,
  SoundOffIcon,
  SoundOnIcon,
  StatsIcon,
  TrophyIcon,
  cn,
} from "@fb/top-10-ui";
import { ttSound } from "@/lib/top-10/sound";
import { BackArrow } from "@/components/back-arrow";

/**
 * Top Ten — game home. A faithful gold-on-black launcher built to Link Up's home
 * standard (atmosphere + hero orb + action grid + rank strip + bottom nav), fitted
 * to Top Ten. Visual layer only; every control is a normal <Link>/<button>.
 */

const ACTIONS = [
  { label: "إنشاء غرفة", href: "/games/top-10/create-room", Icon: CreateRoomIcon },
  { label: "دخول غرفة", href: "/games/top-10/rooms", Icon: JoinRoomIcon },
  { label: "الإحصائيات", href: "/games/top-10/stats", Icon: StatsIcon },
  { label: "دليل اللعب", href: "/games/top-10/guide", Icon: GuideIcon },
] as const;

const NAV = [
  { label: "الإحصائيات", href: "/games/top-10/stats", Icon: StatsIcon, active: false },
  { label: "الرئيسية", href: "/", Icon: HomeIcon, active: true },
  { label: "دليل اللعب", href: "/games/top-10/guide", Icon: GuideIcon, active: false },
] as const;

const EMBERS = [
  { left: "12%", top: "70%", size: 4, dx: "10px", dur: "5s", delay: "0s" },
  { left: "82%", top: "64%", size: 3, dx: "-12px", dur: "6s", delay: "0.8s" },
  { left: "26%", top: "40%", size: 5, dx: "8px", dur: "5.5s", delay: "1.6s" },
  { left: "70%", top: "34%", size: 3, dx: "-8px", dur: "6.5s", delay: "0.4s" },
  { left: "50%", top: "78%", size: 4, dx: "4px", dur: "5.2s", delay: "2.1s" },
  { left: "90%", top: "46%", size: 3, dx: "-6px", dur: "7s", delay: "1.2s" },
] as const;

/** Sound mute toggle — mirrors Link Up's home MuteButton (same position/size/icons),
 *  driven by Top Ten's own sound layer. Reflects the persisted state on mount. */
function MuteButton() {
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(ttSound.muted), []);
  return (
    <button
      type="button"
      aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
      aria-pressed={muted}
      onClick={() => {
        ttSound.unlock();
        setMuted(ttSound.toggle());
      }}
      className="lu-btn lu-frame grid size-10 place-items-center rounded-xl"
    >
      {muted ? <SoundOffIcon size={20} /> : <SoundOnIcon size={20} />}
    </button>
  );
}

export function TenHome({ rank, hubUrl }: { rank: string; hubUrl: string }) {
  const [hasImg, setHasImg] = useState(true);
  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-[26rem] flex-col overflow-hidden bg-[var(--lu-abyss)] px-5 pb-4 page-top">
      <GoldGradientDefs />
      <Atmosphere />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* top bar */}
        <header className="relative flex shrink-0 items-center justify-between gap-3 pt-1">
          <BackArrow fallback={hubUrl} label="رجوع للمنصة" className="lu-btn lu-frame grid size-10 place-items-center rounded-xl">
            <BackIcon size={20} />
          </BackArrow>
          <h1 className="lu-gold-text lu-gold-title pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-black tracking-tight">
            توب 10
          </h1>
          {/* trailing (leftmost in RTL): UI sound mute — exactly like Link Up's home */}
          <MuteButton />
        </header>

        <div aria-hidden className="grow-[3]" />

        {/* hero — quick play */}
        <section className="flex shrink-0 flex-col items-center py-2">
          <Link href="/games/top-10/play" aria-label="اللعب السريع — ابدأ مباراة فورية" className="group relative grid place-items-center outline-none">
            <span aria-hidden className="absolute inset-0">
              {EMBERS.map((e, i) => (
                <span
                  key={i}
                  className="absolute rounded-full"
                  style={
                    {
                      left: e.left,
                      top: e.top,
                      width: e.size,
                      height: e.size,
                      background: "radial-gradient(circle, rgb(var(--c-ember-hi)), rgb(var(--c-ember-2)) 60%, transparent 72%)",
                      boxShadow: "0 0 8px rgb(var(--c-ember-hot)/0.9)",
                      ["--dx" as string]: e.dx,
                      animation: `lu-float-ember ${e.dur} ease-in-out ${e.delay} infinite`,
                    } as CSSProperties
                  }
                />
              ))}
            </span>
            <span
              aria-hidden
              className="lu-anim-pulse absolute size-64 rounded-full"
              style={{ background: "radial-gradient(circle, rgb(var(--c-ember)/0.45), rgb(var(--c-ember)/0.12) 42%, transparent 68%)" }}
            />
            {/* the hero ball — the SAME live fire-gold football as the table center
                (ember glow + breathing pulse), so home and table match Link Up. */}
            <span className="lu-orb lu-anim-breathe relative size-48 overflow-hidden rounded-full shadow-[0_18px_60px_rgb(var(--c-ember)/0.35)] ring-1 ring-[var(--lu-gold-1)]/30 transition-transform duration-300 group-hover:scale-[1.03] group-active:scale-95">
              {hasImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/table-ball.png"
                  alt="كرة قدم ذهبية محاطة بنيران — ابدأ اللعب"
                  onError={() => setHasImg(false)}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : null}
              <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(var(--c-white)/0.18), transparent 30%)" }} />
            </span>
          </Link>
          <p className="lu-gold-text lu-gold-title mt-5 text-2xl font-black tracking-tight">اللعب السريع</p>
          <p className="mt-1 text-sm text-[var(--lu-tan)]">ابدأ مباراة فورية بنقرة واحدة</p>
        </section>

        <div aria-hidden className="grow" />

        {/* action grid */}
        <nav aria-label="إجراءات سريعة" className="grid shrink-0 grid-cols-2 gap-2.5">
          {ACTIONS.map(({ label, href, Icon }) => (
            <Link key={label} href={href} className="lu-btn lu-frame group flex items-center justify-end gap-3 rounded-2xl px-4 py-3">
              <span className="text-sm font-bold text-[var(--lu-cream)]">{label}</span>
              <span className="lu-chip grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-[var(--lu-gold-1)]/30 transition-all group-hover:ring-[var(--lu-ember-glow)]/60">
                <Icon size={20} />
              </span>
            </Link>
          ))}
        </nav>

        <div aria-hidden className="grow" />

        {/* rank strip — mirrors Link Up's home (التصنيف → leaderboard) */}
        <Link href="/games/top-10/rank" aria-label="التصنيف" className="lu-btn lu-frame flex shrink-0 items-center justify-between rounded-2xl px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="lu-chip grid size-10 place-items-center rounded-xl ring-1 ring-[var(--lu-gold-1)]/35">
              <TrophyIcon size={22} />
            </span>
            <div className="text-right">
              <p className="text-base font-bold text-[var(--lu-cream)]">التصنيف</p>
              <p className="text-[11px] text-[var(--lu-tan)]">ترتيبك بين اللاعبين</p>
            </div>
          </div>
          <span className="num lu-gold-text lu-gold-title text-[2.1rem] font-bold leading-none">{rank}</span>
        </Link>

        <div aria-hidden className="grow" />
      </div>

      {/* bottom nav */}
      <nav aria-label="التنقل" className="relative z-20 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="lu-frame flex items-stretch justify-between gap-2 rounded-2xl px-3 py-2">
          {NAV.map(({ label, href, Icon, active }) => (
            <Link key={label} href={href} aria-current={active ? "page" : undefined} className="group flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-full ring-1 transition-all",
                  active ? "lu-chip shadow-[0_0_16px_rgb(var(--c-ember)/0.4)] ring-[var(--lu-ember-glow)]/60" : "bg-black/25 ring-[var(--lu-gold-1)]/20 group-hover:ring-[var(--lu-gold-1)]/45",
                )}
              >
                <Icon size={20} />
              </span>
              <span className={cn("text-[11px] font-bold", active ? "lu-gold-text" : "text-[var(--lu-tan)]")}>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </main>
  );
}
