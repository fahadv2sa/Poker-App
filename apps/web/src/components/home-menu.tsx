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
        className="kebab-btn grid size-11 place-items-center rounded-2xl text-2xl leading-none text-foreground/85 hover:text-foreground"
      >
        ⋯
      </button>

      {open ? (
        <div
          role="menu"
          // The trigger sits on the LEFT of the top bar, so anchor the menu's end
          // (left) edge under it and expand inward — never off the viewport edge.
          className="panel absolute z-30 mt-2 flex w-52 flex-col overflow-hidden p-1.5 text-sm"
          style={{ insetInlineEnd: 0 }}
        >
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
