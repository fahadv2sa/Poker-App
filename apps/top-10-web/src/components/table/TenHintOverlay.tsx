"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircularCountdown, useRemainingMs } from "@fb/table-ui";
import { TT_TIMING, type TtStateView } from "@fb/shared";

const HINT_COUNTDOWN_MS = TT_TIMING.hintCountdownSec * 1000;

/**
 * Hint-mode theatre, centered over the felt:
 *  - a one-shot START FLASH when the round switches NORMAL → HINT;
 *  - during COUNTDOWN, a large cinematic CircularCountdown + a short, clear line that
 *    play is now open to whoever answers fastest after the hint;
 *  - during OPEN, the hint text itself, prominent.
 * The red card/felt borders are handled by TenCard/TenTable. Pointer-events-none so it
 * never blocks the search bar.
 */
export function TenHintOverlay({
  mode,
  hint,
  deadlineTs,
}: {
  mode: TtStateView["mode"];
  hint: TtStateView["hint"];
  deadlineTs: number | null;
}) {
  const [flash, setFlash] = useState(false);
  const prevMode = useRef(mode);
  const remainingMs = useRemainingMs(mode === "HINT" && hint?.phase === "COUNTDOWN" ? deadlineTs : null);

  useEffect(() => {
    if (prevMode.current !== "HINT" && mode === "HINT") {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1800);
      prevMode.current = mode;
      return () => clearTimeout(t);
    }
    prevMode.current = mode;
  }, [mode]);

  const countdown = mode === "HINT" && hint?.phase === "COUNTDOWN";
  const open = mode === "HINT" && hint?.phase === "OPEN";

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4">
      <AnimatePresence>
        {flash ? (
          <motion.div
            key="flash"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.12 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="max-w-[62vw] rounded-2xl border border-[var(--lu-ember)]/70 bg-[#0b0908]/90 px-5 py-4 text-center shadow-[0_0_30px_rgba(255,106,26,0.5)] backdrop-blur"
          >
            <div className="text-2xl font-black text-[var(--lu-ember-glow)]">بدأ وضع التلميح!</div>
            <div className="mt-1 text-sm text-[var(--lu-cream)]/80">انتبه — تتغيّر طريقة اللعب</div>
          </motion.div>
        ) : countdown ? (
          <motion.div
            key="countdown"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 rounded-3xl bg-[#0b0908]/55 px-8 py-6 backdrop-blur-sm"
          >
            {hint?.rank ? (
              <span className="num rounded-full border border-[var(--lu-ember)]/50 bg-[var(--lu-ember)]/15 px-3 py-0.5 text-sm font-black text-[var(--lu-ember-glow)]">
                تلميح للمركز {hint.rank}
              </span>
            ) : null}
            <CircularCountdown remainingMs={remainingMs} totalMs={HINT_COUNTDOWN_MS} />
            <p className="max-w-[16rem] text-center text-sm font-bold leading-snug text-[var(--lu-ember-glow)]">
              بعد التلميح، أسرع لاعب يكتب الإجابة الصحيحة يكسب البطاقة
            </p>
          </motion.div>
        ) : open && hint?.text ? (
          <motion.div
            key="open"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-[52vw] rounded-2xl border border-[var(--lu-ember)]/50 bg-[#0b0908]/85 px-4 py-3 text-center shadow-xl backdrop-blur"
          >
            <div className="text-[0.66rem] font-bold tracking-[0.18em] text-[var(--lu-ember-glow)]">
              {hint?.rank ? `تلميح للمركز ${hint.rank} · الأسرع يفوز` : "تلميح · الأسرع يفوز"}
            </div>
            <div className="mt-1 text-lg font-extrabold text-[var(--lu-cream)]">{hint.text}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
