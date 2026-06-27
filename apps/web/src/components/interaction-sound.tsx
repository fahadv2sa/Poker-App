"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { sound } from "@/lib/sound";

/**
 * App-wide tap sound. A single delegated pointerdown listener (mounted once in
 * the root layout) plays ONE unified "tap" clip (deep/muted) for every
 * button/link/icon press during navigation — one cohesive sound across the whole
 * app (the former distinct Quick Play clip was folded into this single tap, so
 * data-sound="quick-play" no longer changes the sound).
 *
 * Plays on the INDEPENDENT UI bus (sound.playUi) so it is muted only by the
 * top-bar toggle — never by the game table's own mute, and vice versa.
 *
 * EXCLUDED on the live game table (/table/*): that screen has its own dedicated,
 * server-event-driven audio system and must not get these unified taps.
 *
 * Autoplay-safe: the first pointer gesture anywhere unlocks the AudioContext and
 * lazily preloads only the single UI clip (not the full game set). Opt out on any
 * control with data-sound="none".
 */

const INTERACTIVE =
  'button, a[href], [role="button"], summary, input[type="submit"], input[type="button"]';

export function InteractionSound() {
  const pathname = usePathname();
  // Read the live path from a ref so the listener is attached once.
  const onTable = useRef(false);
  onTable.current = pathname?.startsWith("/table/") ?? false;

  useEffect(() => {
    let primed = false;
    const onPointerDown = (e: PointerEvent) => {
      // The live game table owns its own audio — never add UI clicks there.
      if (onTable.current) return;
      // First gesture anywhere primes audio (browser autoplay policy), even if
      // the tap wasn't on a control.
      if (!primed) {
        primed = true;
        sound.unlock();
        void sound.ensure(["tap"]);
      }
      const el = (e.target as Element | null)?.closest(INTERACTIVE);
      if (!el || el.closest('[data-sound="none"]')) return;
      sound.playUi("tap");
    };
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("pointerdown", onPointerDown, opts);
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, []);

  return null;
}
