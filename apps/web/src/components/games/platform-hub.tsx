"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { sound, useUiSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import type { GameEntry } from "@/lib/games";
import {
  EmblemIcon,
  GoldGradientDefs,
  HeartIcon,
  LockIcon,
  LogoutIcon,
  MenuDotsIcon,
  SoundOffIcon,
  SoundOnIcon,
  UsersIcon,
} from "./lu-icons";

/**
 * Platform hub (Football B), gold-on-black redesign (docs/DESIGN_BRIEF.md §8).
 * VISUAL LAYER ONLY: identity-only front door — avatar/name + likes/friends and a
 * 2×2 game grid. All values arrive as props from the server page; the logout
 * server action is passed through and used in a plain <form>, so auth is
 * unchanged. Re-implemented natively from the locked target (no external code).
 */
export function PlatformHub({
  displayName,
  avatarUrl,
  hue,
  initial,
  likes,
  friends,
  games,
  logoutAction,
}: {
  displayName: string;
  avatarUrl: string | null;
  hue: number;
  initial: string;
  likes: string;
  friends: string;
  games: GameEntry[];
  /** Sign-out server action. Optional so the visual preview harness can omit it. */
  logoutAction?: () => void | Promise<void>;
}) {
  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-[26rem] flex-col overflow-hidden bg-[var(--lu-abyss)] px-5 pb-8 page-top">
      <GoldGradientDefs />
      <Atmosphere />

      <div className="relative z-10 flex flex-1 flex-col">
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

        {/* identity card — avatar, name, likes + friends */}
        <section className="lu-frame mt-6 flex flex-col items-center gap-3 rounded-3xl p-6">
          <Link href="/profile" aria-label="الملف الشخصي" className="transition active:scale-95">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="size-24 rounded-full object-cover shadow-[0_0_0_2px_rgba(242,210,122,0.5),0_0_28px_rgba(255,106,26,0.3)]"
              />
            ) : (
              <div
                aria-hidden
                className="grid size-24 place-items-center rounded-full text-4xl font-black text-white shadow-[0_0_0_2px_rgba(242,210,122,0.5),0_0_28px_rgba(255,106,26,0.3)]"
                style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
              >
                {initial}
              </div>
            )}
          </Link>
          <span className="max-w-[12rem] truncate text-lg font-bold text-[var(--lu-cream)]">{displayName}</span>

          <div className="mt-1 flex items-center gap-10">
            <Stat icon={<HeartIcon size={18} />} value={likes} label="إعجاب" />
            <Stat icon={<UsersIcon size={18} />} value={friends} label="الأصدقاء" href="/friends" />
          </div>
        </section>

        {/* games grid — 2×2 */}
        <h2 className="mb-3 mt-7 text-center text-sm font-bold text-[var(--lu-tan)]">اختر لعبة</h2>
        <div className="grid grid-cols-2 gap-3">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
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
            "repeating-linear-gradient(60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-60deg, rgba(242,210,122,0.6) 0, rgba(242,210,122,0.6) 1px, transparent 1px, transparent 26px)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 18%, #000 30%, transparent 78%)",
          maskImage: "radial-gradient(120% 90% at 50% 18%, #000 30%, transparent 78%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% 6%, rgba(255,106,26,0.16), transparent 55%), radial-gradient(90% 40% at 50% 100%, rgba(201,150,46,0.12), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 58%, rgba(0,0,0,0.6) 100%)" }}
      />
    </div>
  );
}

function Stat({ icon, value, label, href }: { icon: React.ReactNode; value: string; label: string; href?: string }) {
  const body = (
    <>
      <span className="lu-chip grid size-11 place-items-center rounded-2xl ring-1 ring-[var(--lu-gold-1)]/30">{icon}</span>
      <span className="num text-sm font-extrabold leading-none text-[var(--lu-cream)]">{value}</span>
      <span className="text-[0.66rem] text-[var(--lu-tan)]">{label}</span>
    </>
  );
  const cls = "group flex w-16 flex-col items-center gap-1.5 text-center";
  return href ? (
    <Link href={href} className={cn(cls, "transition active:scale-95")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function GameCard({ game }: { game: GameEntry }) {
  const live = game.status === "live" && game.href;
  const base = "lu-frame relative flex aspect-[4/5] flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl p-4 text-center";

  const art = live ? (
    <span className="lu-anim-breathe relative size-20 overflow-hidden rounded-full ring-1 ring-[var(--lu-gold-1)]/30 shadow-[0_8px_28px_rgba(255,106,26,0.3)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/gold-fire-football.png" alt="" className="absolute inset-0 size-full object-cover" />
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
        if (!next) sound.playUi("click");
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
        <div
          role="menu"
          className="lu-frame absolute z-30 mt-2 flex w-48 flex-col overflow-hidden rounded-2xl p-1.5 text-sm"
          style={{ insetInlineEnd: 0 } as CSSProperties}
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
      ) : null}
    </div>
  );
}
