"use client";

import { useEffect } from "react";
import { sound } from "@/lib/sound";

/**
 * App-wide tap sound. A single delegated pointerdown listener (mounted once in
 * the root layout) plays the unified "click" clip for every button/link tap, and
 * a DISTINCT clip for the Quick Play button (tagged data-sound="quick-play").
 *
 * Autoplay-safe: the first pointer gesture anywhere unlocks the AudioContext and
 * lazily preloads only the two UI clips (not the full game set). Opt out on any
 * control with data-sound="none". Respects the global mute (sound.play no-ops
 * when muted). No server involvement; purely a reaction to the user's tap.
 */

/** Distinct from the unified click — reuses an existing clip (no new asset). */
const QUICK_PLAY_SOUND = "shuffle" as const;
const INTERACTIVE =
  'button, a[href], [role="button"], summary, input[type="submit"], input[type="button"]';

export function InteractionSound() {
  useEffect(() => {
    let primed = false;
    const onPointerDown = (e: PointerEvent) => {
      // First gesture anywhere primes audio (browser autoplay policy), even if
      // the tap wasn't on a control.
      if (!primed) {
        primed = true;
        sound.unlock();
        void sound.ensure(["click", QUICK_PLAY_SOUND]);
      }
      const el = (e.target as Element | null)?.closest(INTERACTIVE);
      if (!el || el.closest('[data-sound="none"]')) return;
      sound.play(el.closest('[data-sound="quick-play"]') ? QUICK_PLAY_SOUND : "click");
    };
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("pointerdown", onPointerDown, opts);
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, []);

  return null;
}
