"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { sound, useUiSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import {
  BackIcon,
  BankIcon,
  CreateRoomIcon,
  GoldGradientDefs,
  GuideIcon,
  HomeIcon,
  JoinRoomIcon,
  SettingsIcon,
  SoundOffIcon,
  SoundOnIcon,
  StatsIcon,
  TrophyIcon,
} from "./lu-icons";

/**
 * Link Up — game home, gold-on-black redesign (docs/DESIGN_BRIEF.md §8).
 * VISUAL LAYER ONLY: every control is a normal <Link> to its existing route, so
 * navigation/logic is unchanged. Server-fetched values arrive as props; the
 * modals (level-up, install reward, room-closed) are rendered by the server page
 * as siblings, so this stays a pure presentational client component.
 *
 * Re-implemented natively from the approved v0 target — no external code reused.
 */

type Action = { label: string; href: string; Icon: typeof BankIcon };

// RTL grid: the first item lands top-right, then fills right→left.
const ACTIONS: Action[] = [
  { label: "إنشاء غرفة", href: "/create-room", Icon: CreateRoomIcon },
  { label: "دخول غرفة", href: "/rooms", Icon: JoinRoomIcon },
  { label: "الإحصائيات", href: "/stats", Icon: StatsIcon },
  { label: "البنك", href: "/bank", Icon: BankIcon },
];

// RTL row: first item renders rightmost.
const NAV = [
  { label: "الإعدادات", href: "/profile", Icon: SettingsIcon, active: false },
  { label: "الرئيسية", href: "/", Icon: HomeIcon, active: true },
  { label: "دليل اللعب", href: "/guide", Icon: GuideIcon, active: false },
];

// Floating ember particles around the hero (deterministic → no hydration drift).
const EMBERS = [
  { left: "12%", top: "70%", size: 4, dx: "10px", dur: "5s", delay: "0s" },
  { left: "82%", top: "64%", size: 3, dx: "-12px", dur: "6s", delay: "0.8s" },
  { left: "26%", top: "40%", size: 5, dx: "8px", dur: "5.5s", delay: "1.6s" },
  { left: "70%", top: "34%", size: 3, dx: "-8px", dur: "6.5s", delay: "0.4s" },
  { left: "50%", top: "78%", size: 4, dx: "4px", dur: "5.2s", delay: "2.1s" },
  { left: "90%", top: "46%", size: 3, dx: "-6px", dur: "7s", delay: "1.2s" },
] as const;

export function LinkUpHome({
  rank,
  totalPlayers,
}: {
  /** Global rank, pre-formatted, e.g. "#128". */
  rank: string;
  /** Optional total human-player count, pre-formatted, e.g. "4.2K". Omitted on
   *  the live page (no extra query); shown in the preview. */
  totalPlayers?: string;
}) {
  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-[26rem] flex-col overflow-hidden bg-[var(--lu-abyss)] px-5 pb-4 page-top">
      <GoldGradientDefs />
      <Atmosphere />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TopBar />
        <Hero />
        <ActionGrid />
        <RankStrip rank={rank} totalPlayers={totalPlayers} />
      </div>

      <BottomNav />
    </main>
  );
}

/** Cinematic background built entirely from gradients — quiet gold motif + molten
 *  dot texture + ember/gold light pools + a deep vignette. */
function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px)",
          WebkitMaskImage: "radial-gradient(120% 100% at 50% 45%, #000 30%, transparent 78%)",
          maskImage: "radial-gradient(120% 100% at 50% 45%, #000 30%, transparent 78%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,179,71,0.7) 1px, transparent 1.4px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 50% at 50% 14%, rgba(255,106,26,0.16), transparent 55%), radial-gradient(95% 42% at 50% 100%, rgba(201,150,46,0.14), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.65) 100%)" }}
      />
    </div>
  );
}

function TopBar() {
  return (
    <header className="relative flex shrink-0 items-center justify-between gap-3 pt-1">
      {/* leading (rightmost in RTL): back to the platform hub */}
      <Link
        href="/"
        aria-label="رجوع"
        className="lu-btn grid size-10 place-items-center rounded-xl lu-frame"
      >
        <BackIcon size={20} />
      </Link>

      {/* centered brand title */}
      <h1 className="lu-gold-text lu-gold-title pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-black tracking-tight">
        لينك اب
      </h1>

      {/* trailing (leftmost in RTL): UI sound mute */}
      <MuteButton />
    </header>
  );
}

function MuteButton() {
  const { uiMuted, setUiMuted } = useUiSound();
  return (
    <button
      type="button"
      aria-label={uiMuted ? "تشغيل أصوات الواجهة" : "كتم أصوات الواجهة"}
      aria-pressed={uiMuted}
      data-sound="none"
      onClick={() => {
        sound.unlock();
        const next = !uiMuted;
        setUiMuted(next);
        if (!next) sound.playUi("tap");
      }}
      className="lu-btn grid size-10 place-items-center rounded-xl lu-frame"
    >
      {uiMuted ? <SoundOffIcon size={20} /> : <SoundOnIcon size={20} />}
    </button>
  );
}

function Hero() {
  const [hasImg, setHasImg] = useState(true);
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
      <Link
        href="/quick-play"
        data-sound="quick-play"
        aria-label="اللعب السريع — ابدأ مباراة فورية"
        className="group relative grid place-items-center outline-none"
      >
        {/* floating embers */}
        <span aria-hidden className="absolute inset-0">
          {EMBERS.map((e, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: e.left,
                top: e.top,
                width: e.size,
                height: e.size,
                background: "radial-gradient(circle, #ffd99a, #ff7a1a 60%, transparent 72%)",
                boxShadow: "0 0 8px rgba(255,138,40,0.9)",
                ["--dx" as string]: e.dx,
                animation: `lu-float-ember ${e.dur} ease-in-out ${e.delay} infinite`,
              } as CSSProperties}
            />
          ))}
        </span>

        {/* radial fire backdrop */}
        <span
          aria-hidden
          className="lu-anim-pulse absolute size-64 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,106,26,0.45), rgba(255,106,26,0.12) 42%, transparent 68%)",
          }}
        />
        {/* the hero ball — the SAME live fire-gold football as the table center
            (ember glow + breathing pulse, no rings), so home and table match. */}
        <span className="lu-orb lu-anim-breathe relative size-48 overflow-hidden rounded-full shadow-[0_18px_60px_rgba(255,106,26,0.35)] ring-1 ring-[var(--lu-gold-1)]/30 transition-transform duration-300 group-hover:scale-[1.03] group-active:scale-95">
          {hasImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/table-ball.png"
              alt="كرة قدم ذهبية محاطة بنيران — ابدأ اللعب"
              onError={() => setHasImg(false)}
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent 30%)" }}
          />
        </span>
      </Link>

      <p className="lu-gold-text lu-gold-title mt-5 text-2xl font-black tracking-tight">اللعب السريع</p>
      <p className="mt-1 text-sm text-[var(--lu-tan)]">ابدأ مباراة فورية بنقرة واحدة</p>
    </section>
  );
}

function ActionGrid() {
  return (
    <nav aria-label="إجراءات سريعة" className="grid shrink-0 grid-cols-2 gap-2.5">
      {ACTIONS.map(({ label, href, Icon }) => (
        <Link
          key={label}
          href={href}
          className="lu-btn lu-frame group flex items-center justify-end gap-3 rounded-2xl px-4 py-3"
        >
          <span className="text-sm font-bold text-[var(--lu-cream)]">{label}</span>
          <span className="lu-chip grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-[var(--lu-gold-1)]/30 transition-all group-hover:ring-[var(--lu-ember-glow)]/60 group-active:ring-[var(--lu-ember)]/70">
            <Icon size={20} />
          </span>
        </Link>
      ))}
    </nav>
  );
}

function RankStrip({ rank, totalPlayers }: { rank: string; totalPlayers?: string }) {
  return (
    <Link
      href="/rank"
      aria-label="التصنيف"
      className="lu-btn lu-frame mt-2.5 flex shrink-0 items-center justify-between rounded-2xl px-5 py-3"
    >
      {/* right cluster (first child in RTL): trophy + label */}
      <div className="flex items-center gap-3">
        <span className="lu-chip grid size-10 place-items-center rounded-xl ring-1 ring-[var(--lu-gold-1)]/35">
          <TrophyIcon size={22} />
        </span>
        <div className="text-right">
          <p className="text-base font-bold text-[var(--lu-cream)]">التصنيف</p>
          <p className="text-[11px] text-[var(--lu-tan)]">ترتيبك بين جميع اللاعبين</p>
        </div>
      </div>

      {/* left cluster: the rank number */}
      <div className="flex flex-col items-end">
        <span className="num lu-gold-text lu-gold-title text-[2.1rem] font-bold leading-none">{rank}</span>
        {totalPlayers ? (
          <span className="mt-1 text-[10px] font-semibold text-[var(--lu-tan)]">
            من <span className="num">{totalPlayers}</span> لاعب
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function BottomNav() {
  return (
    <nav aria-label="التنقل" className="relative z-20 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
      <div className="lu-frame flex items-stretch justify-between gap-2 rounded-2xl px-3 py-2">
        {NAV.map(({ label, href, Icon, active }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className="group flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors"
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-full ring-1 transition-all",
                active
                  ? "lu-chip shadow-[0_0_16px_rgba(255,106,26,0.4)] ring-[var(--lu-ember-glow)]/60"
                  : "bg-black/25 ring-[var(--lu-gold-1)]/20 group-hover:ring-[var(--lu-gold-1)]/45",
              )}
            >
              <Icon size={20} />
            </span>
            <span className={cn("text-[11px] font-bold", active ? "lu-gold-text" : "text-[var(--lu-tan)]")}>
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
