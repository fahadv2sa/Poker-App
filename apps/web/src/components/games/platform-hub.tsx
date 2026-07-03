"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { sound, useUiSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import type { GameEntry } from "@/lib/games";
import {
  CrownIcon,
  EmblemIcon,
  GoldGradientDefs,
  LockIcon,
  LogoutIcon,
  MenuDotsIcon,
  SoundOffIcon,
  SoundOnIcon,
} from "./lu-icons";

/**
 * Platform hub (Football B), gold-on-black redesign (docs/DESIGN_BRIEF.md §8).
 * VISUAL LAYER ONLY: identity-only front door — avatar/name, a premium Subscribe
 * card, and a 2×2 game grid. All values arrive as props from the server page; the
 * logout server action is passed through and used in a plain <form>, so auth is
 * unchanged. Re-implemented natively from the locked target (no external code).
 */
export function PlatformHub({
  displayName,
  avatarUrl,
  hue,
  initial,
  games,
  logoutAction,
}: {
  displayName: string;
  avatarUrl: string | null;
  hue: number;
  initial: string;
  games: GameEntry[];
  /** Sign-out server action. Optional so the visual preview harness can omit it. */
  logoutAction?: () => void | Promise<void>;
}) {
  return (
    <main className="relative mx-auto flex h-[100dvh] max-w-[26rem] flex-col overflow-hidden bg-[var(--lu-abyss)] px-5 pb-5 page-top">
      <GoldGradientDefs />
      <Atmosphere />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* top bar: emblem + brand (right) · sound + menu (left) */}
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="lu-frame grid size-10 place-items-center rounded-xl">
              <EmblemIcon size={22} />
            </span>
            <span className="lu-gold-text lu-gold-title text-lg font-black tracking-tight">فوتبول بي</span>
          </div>
          <div className="flex items-center gap-2">
            <MuteButton />
            <HubMenu logoutAction={logoutAction} />
          </div>
        </header>

        {/* identity card — avatar + name only */}
        <section className="lu-frame mt-4 flex shrink-0 flex-col items-center gap-2 rounded-3xl p-4">
          <Link href="/profile" aria-label="الملف الشخصي" className="transition active:scale-95">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="size-20 rounded-full object-cover shadow-[0_0_0_2px_rgb(var(--c-gold-1)/0.5),0_0_28px_rgb(var(--c-ember)/0.3)]"
              />
            ) : (
              <div
                aria-hidden
                className="grid size-20 place-items-center rounded-full text-3xl font-black text-white shadow-[0_0_0_2px_rgb(var(--c-gold-1)/0.5),0_0_28px_rgb(var(--c-ember)/0.3)]"
                style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
              >
                {initial}
              </div>
            )}
          </Link>
          <span className="max-w-[12rem] truncate text-lg font-bold text-[var(--lu-cream)]">{displayName}</span>
        </section>

        {/* premium subscribe card — between identity and the games grid */}
        <SubscribeCard />

        {/* games grid — flex-fills the remaining height so the whole page fits
            one screen with no scroll (the 2×2 cards scale to the space) */}
        <section className="mt-4 flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 shrink-0 text-center text-sm font-bold text-[var(--lu-tan)]">اختر لعبة</h2>
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2.5">
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>

        {/* developer credit — subtle, pinned at the bottom under the cards */}
        <footer className="shrink-0 pt-3 text-center">
          <p className="text-[11px] font-medium tracking-wide text-[var(--lu-tan)]/75">
            Powered By <span className="lu-gold-text font-bold">Fmg-Tech</span>
          </p>
        </footer>
      </div>
    </main>
  );
}

function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(60deg, rgb(var(--c-gold-1)/0.6) 0, rgb(var(--c-gold-1)/0.6) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-60deg, rgb(var(--c-gold-1)/0.6) 0, rgb(var(--c-gold-1)/0.6) 1px, transparent 1px, transparent 26px)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 18%, rgb(var(--c-black)) 30%, transparent 78%)",
          maskImage: "radial-gradient(120% 90% at 50% 18%, rgb(var(--c-black)) 30%, transparent 78%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% 6%, rgb(var(--c-ember)/0.16), transparent 55%), radial-gradient(90% 40% at 50% 100%, rgb(var(--c-gold-2)/0.12), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 58%, rgb(var(--c-black)/0.6) 100%)" }}
      />
    </div>
  );
}

/** Premium, live Subscribe card — gold frame, breathing ember aura, a slow gold
 *  sheen sweep and floating embers. Taps through to /subscribe. Visual only. */
function SubscribeCard() {
  return (
    <Link
      href="/subscribe"
      data-sound="quick-play"
      aria-label="اشترك الآن واحصل على المزايا الكاملة"
      className="lu-btn lu-sub lu-sub-rim group relative mt-4 flex shrink-0 items-center gap-4 overflow-hidden rounded-3xl p-5 transition active:scale-[0.98]"
    >
      {/* gradient-bevel gold border (same metal edge as lu-frame). The absolute
          overlay is on the OUTER span; the inner span carries `.lu-frame` so its
          `position: relative` can't defeat the overlay's positioning. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl">
        <span className="lu-frame block size-full rounded-3xl" style={{ background: "transparent", boxShadow: "none" }} />
      </span>
      {/* sweeping gold sheen */}
      <span aria-hidden className="lu-sub-sheen" />
      {/* floating embers */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <span className="lu-anim-float absolute bottom-3 right-8 size-1 rounded-full bg-[var(--lu-ember)]" style={{ ["--dx" as string]: "8px", animationDelay: "0s" }} />
        <span className="lu-anim-float absolute bottom-2 right-16 size-[3px] rounded-full bg-[var(--lu-ember-glow)]" style={{ ["--dx" as string]: "-6px", animationDelay: "1.3s" }} />
        <span className="lu-anim-float absolute bottom-4 right-24 size-1 rounded-full bg-[var(--lu-ember)]" style={{ ["--dx" as string]: "4px", animationDelay: "2.6s" }} />
      </span>

      {/* crown medallion with a breathing ember halo */}
      <span className="relative grid shrink-0 place-items-center">
        <span
          aria-hidden
          className="lu-anim-pulse absolute size-16 rounded-full"
          style={{ background: "radial-gradient(circle, rgb(var(--c-ember)/0.45), transparent 66%)" }}
        />
        <span className="lu-chip relative grid size-14 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/40 shadow-[0_8px_24px_rgb(var(--c-ember)/0.28)]">
          <CrownIcon size={28} />
        </span>
      </span>

      {/* copy */}
      <span className="relative z-10 flex min-w-0 flex-1 flex-col">
        <span className="lu-gold-text lu-gold-title text-lg font-black leading-tight">اشترك الآن</span>
        <span className="truncate text-[0.82rem] font-medium text-[var(--lu-tan)]">واحصل على المزايا الكاملة</span>
      </span>

      {/* forward chevron (RTL: points left, into the card) */}
      <svg
        aria-hidden
        width={20}
        height={20}
        viewBox="0 0 24 24"
        className="relative z-10 shrink-0 transition-transform group-hover:-translate-x-0.5"
        style={{ filter: "drop-shadow(0 1px 1px rgb(var(--c-black)/0.5)) drop-shadow(0 0 5px rgb(var(--c-ember-glow)/0.35))" }}
      >
        <path d="M14 6l-6 6 6 6" fill="none" stroke="url(#lu-gold)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function GameCard({ game }: { game: GameEntry }) {
  const live = game.status === "live" && game.href;
  const base = "lu-frame relative flex h-full min-h-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-3xl p-3 text-center";

  const art = live ? (
    <span className="relative grid place-items-center">
      {/* ember glow halo — same live treatment as the table/home ball */}
      <span
        aria-hidden
        className="lu-anim-pulse absolute size-24 rounded-full"
        style={{ background: "radial-gradient(circle, rgb(var(--c-ember)/0.4), transparent 66%)" }}
      />
      {/* Theme 0 (and any non-Daylight theme): the original live fireball. */}
      <span className="lu-anim-breathe lu-cta-fireball relative size-20 overflow-hidden rounded-full ring-1 ring-[var(--lu-gold-1)]/30 shadow-[0_8px_28px_rgb(var(--c-ember)/0.3)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/table-ball.png" alt="" className="absolute inset-0 size-full object-cover" />
      </span>
      {/* Theme 1 (Daylight) ONLY: an elegant animated "Play Now" (العب الآن) medallion
          in the EXACT same size-20 slot — a breathing gold-rimmed chip with a slow
          rotating gold sheen ring and a centered gold play glyph. Visual only. The
          .lu-cta-* pair is display-toggled by [data-theme] in @fb/theme core.css. */}
      <span className="lu-anim-breathe lu-chip lu-cta-playnow relative size-20 place-items-center overflow-hidden rounded-full ring-1 ring-[var(--lu-gold-1)]/30 shadow-[0_8px_28px_rgb(var(--c-ember)/0.3)]">
        <span
          aria-hidden
          className="lu-anim-spin absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgb(var(--c-gold-1)/0.55) 40deg, transparent 120deg, transparent 230deg, rgb(var(--c-gold-2)/0.5) 300deg, transparent 360deg)",
            WebkitMaskImage:
              "radial-gradient(farthest-side, transparent calc(100% - 3px), rgb(var(--c-black)) calc(100% - 3px))",
            maskImage:
              "radial-gradient(farthest-side, transparent calc(100% - 3px), rgb(var(--c-black)) calc(100% - 3px))",
          }}
        />
        <svg
          aria-hidden
          width={30}
          height={30}
          viewBox="0 0 24 24"
          className="relative"
          style={{
            transform: "translateX(1px)",
            filter:
              "drop-shadow(0 1px 1px rgb(var(--c-black)/0.5)) drop-shadow(0 0 6px rgb(var(--c-ember-glow)/0.45))",
          }}
        >
          <path
            d="M8 6.5l10 5.5-10 5.5z"
            fill="url(#lu-gold)"
            stroke="url(#lu-gold)"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  ) : (
    <span className="lu-chip grid size-16 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/20">
      <LockIcon size={26} />
    </span>
  );

  const body = (
    <>
      {art}
      <span className={cn("text-base font-bold", live ? "lu-gold-text lu-gold-title" : "text-[var(--lu-cream)]/70")}>
        {game.nameAr}
      </span>
      {live ? (
        <span className="text-[0.72rem] font-bold text-[var(--lu-ember-glow)]">العب الآن</span>
      ) : (
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[0.62rem] font-bold text-[var(--lu-tan)]">قريباً</span>
      )}
    </>
  );

  if (live) {
    return (
      <Link href={game.href!} data-sound="quick-play" className={cn(base, "lu-btn transition active:scale-95")}>
        {body}
      </Link>
    );
  }
  return (
    <div aria-disabled className={cn(base, "opacity-55")}>
      {body}
    </div>
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
      {uiMuted ? <SoundOffIcon size={18} /> : <SoundOnIcon size={18} />}
    </button>
  );
}

/** Gold overflow menu — logout (reuses the passed server action). */
function HubMenu({ logoutAction }: { logoutAction?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="القائمة"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="lu-btn grid size-10 place-items-center rounded-xl lu-frame"
      >
        <MenuDotsIcon size={18} />
      </button>
      {open ? (
        // Positioning wrapper is kept SEPARATE from `.lu-frame`: `.lu-frame` sets
        // `position: relative` and (being in a later @layer utilities block than
        // Tailwind core) overrides the `absolute` utility — which previously pulled
        // the menu back into flow and reflowed the header. The outer div owns the
        // floating position; the inner div owns the gold surface.
        <div
          className="absolute top-full z-50 mt-2 w-48"
          style={{ insetInlineEnd: 0 } as CSSProperties}
        >
          <div
            role="menu"
            className="lu-frame flex flex-col overflow-hidden rounded-2xl p-1.5 text-sm shadow-2xl"
          >
            {logoutAction ? (
              <form action={logoutAction} className="contents">
                <button
                  role="menuitem"
                  type="submit"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[var(--lu-cream)] transition hover:bg-white/5"
                >
                  <LogoutIcon size={18} /> تسجيل الخروج
                </button>
              </form>
            ) : (
              <span className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[var(--lu-tan)]">
                <LogoutIcon size={18} /> تسجيل الخروج
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
