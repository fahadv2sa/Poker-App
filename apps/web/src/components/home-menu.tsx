"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Home top-bar overflow menu (the ⋯ on the right). A small dropdown with the
 * game guide, friends, and log out. Logout reuses the existing `signOut` server
 * action, passed in from the (server) home page exactly like LogoutConfirm does —
 * no auth behavior changes here, this only relocates the entry points. Closes on
 * outside-click or Escape.
 */
export function HomeMenu({ logoutAction }: { logoutAction: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-start transition hover:bg-secondary/60";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="القائمة"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-full border border-border/70 bg-card/70 text-2xl leading-none text-foreground/80 backdrop-blur transition hover:border-primary/45 hover:text-foreground"
      >
        ⋯
      </button>

      {open ? (
        <div
          role="menu"
          // RTL: anchor the menu's start (right) edge under the trigger so it
          // expands inward and never overflows the viewport's right edge.
          className="panel absolute z-30 mt-2 flex w-52 flex-col overflow-hidden p-1.5 text-sm"
          style={{ insetInlineStart: 0 }}
        >
          <Link role="menuitem" href="/friends" onClick={() => setOpen(false)} className={item}>
            <span aria-hidden>👥</span> الأصدقاء
          </Link>
          <Link role="menuitem" href="/guide" onClick={() => setOpen(false)} className={item}>
            <span aria-hidden>📖</span> دليل اللعب
          </Link>
          <form action={logoutAction} className="contents">
            <button
              role="menuitem"
              type="submit"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-destructive transition hover:bg-destructive/10"
            >
              <span aria-hidden>🚪</span> تسجيل الخروج
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
