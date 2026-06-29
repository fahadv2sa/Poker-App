"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FlyProvider, useFly } from "@fb/table-ui";
import { ANIMATIONS_ENABLED, anim } from "@/lib/anim";
import { fxBus } from "@/lib/fx-bus";
import { cn } from "@/lib/utils";

// The generic fly system, CountUp, TurnFrame and rectCenter now live in @fb/table-ui
// (shared with Top Ten). Re-exported here so existing importers of "./fx" are unchanged
// (`useFx` is the shared `useFly`).
export { CountUp, TurnFrame, rectCenter, useFly as useFx } from "@fb/table-ui";

/**
 * Link Up FX provider — composes the shared FlyProvider with the POKER-specific glue:
 * the fx-bus bridge (chip travel on bet/raise/call/all-in) and the all-in gold flash.
 * Always safe to mount; under reduced-motion / animations-off it does nothing extra.
 */
export function FxProvider({ children }: { children: ReactNode }) {
  return (
    <FlyProvider enabled={ANIMATIONS_ENABLED}>
      {children}
      <FxBusBridge />
    </FlyProvider>
  );
}

/**
 * Bridges the poker fx-bus to the shared fly layer + owns the all-in flash. #3 chip
 * scatter (every coin-contributing action) rides the bus; #12 all-in flash is the
 * all-in signature (different layer, no double-up). Mirrors the previous behavior
 * exactly: no subscription at all when animations are off / reduced-motion.
 */
function FxBusBridge() {
  const { fly } = useFly();
  const [flash, setFlash] = useState(0); // bumped to retrigger the all-in flash
  const reduced = useReducedMotion();
  const active = ANIMATIONS_ENABLED && !reduced;

  useEffect(() => {
    if (!active) return;
    return fxBus.on((e) => {
      if (e.type === "bet" && anim("chipTravel")) {
        // A tasteful handful, scaling modestly with the amount but capped at 7.
        const count = Math.max(3, Math.min(7, 3 + Math.floor(e.amount / 120)));
        fly({ from: `[data-fx="seat-${e.seat}"]`, to: `[data-fx="pot"]`, kind: "chip", label: `+${e.amount}`, count });
      } else if (e.type === "allin" && anim("allInBeat")) {
        setFlash((n) => n + 1);
      }
    });
  }, [active, fly]);

  return (
    <AnimatePresence>
      {flash > 0 ? (
        <motion.div
          key={flash}
          className="pointer-events-none fixed inset-0 z-[55]"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          onAnimationComplete={() => setFlash(0)}
          style={{
            background:
              "radial-gradient(120% 80% at 50% 50%, transparent 55%, color-mix(in oklch, var(--gold) 55%, transparent))",
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}

// ── #10 Street-transition flourish ───────────────────────────────────────────
/** Briefly flashes the new street's Arabic name over the table when `phase`
 *  changes to a community street. Mounts/unmounts itself; no layout impact. */
export function StreetFlourish({ phase }: { phase: string }) {
  const LABELS: Record<string, string> = {
    FLOP: "الفلوب",
    TURN: "التيرن",
    RIVER: "الريفر",
    SHOWDOWN: "الكشف",
  };
  const [show, setShow] = useState<string | null>(null);
  const prev = useRef(phase);

  useEffect(() => {
    if (prev.current !== phase && anim("streetFlourish") && LABELS[phase]) {
      setShow(LABELS[phase]);
      const t = setTimeout(() => setShow(null), 1100);
      prev.current = phase;
      return () => clearTimeout(t);
    }
    prev.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/3 z-40 flex justify-center" aria-hidden>
      <AnimatePresence>
        {show ? (
          <motion.div
            key={show}
            initial={{ opacity: 0, scale: 0.7, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={cn(
              "rounded-2xl border border-[var(--lu-gold-1)]/40 bg-[#0b0908]/80 px-8 py-3 text-2xl font-black text-[var(--lu-gold-1)]",
              "shadow-2xl backdrop-blur",
            )}
          >
            {show}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
