"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { sound } from "@/lib/sound";

/**
 * Cinematic "level up" celebration. Reuses the Add-to-Home-Screen modal shell
 * (overlay + .panel panel-accent card) for a consistent visual identity, with a
 * confetti burst, light-burst glow, and a spring-animated level emblem. Plays a
 * celebratory sound on the OUTSIDE-TABLE UI bus (respects the global mute).
 *
 * The parent (home page) only mounts this when the server says the player has a
 * pending level-up (level > celebrated_level). On dismiss we ack the server
 * (advancing celebrated_level) BEFORE refreshing, so it never re-shows.
 */

const CONFETTI_COLORS = ["var(--gold)", "var(--primary)", "var(--accent)", "#ffffff"];
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37 + 5) % 100,
  delay: (i % 10) * 0.28,
  duration: 2.6 + (i % 5) * 0.5,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
}));

export function LevelUpModal({ newLevel, dailyBank }: { newLevel: number; dailyBank: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  // Celebratory sound on appearance — the outside-table UI bus, so it respects
  // the top-bar mute. Best-effort under autoplay policy (usually unlocked since
  // the player reached home via a tap).
  useEffect(() => {
    sound.unlock();
    void sound.ensure(["win"]).then(() => sound.playUi("win"));
  }, []);

  // After the exit animation: tell the server (advance celebrated_level) and then
  // re-read, so the modal can't reappear for this level. Ack before refresh.
  const onExitComplete = async () => {
    try {
      await fetch("/api/level-up/ack", { method: "POST" });
    } catch {
      /* server is the source of truth; it'll simply re-show next load if this failed */
    }
    router.refresh();
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence onExitComplete={onExitComplete}>
        {open ? (
          <motion.div
            key="levelup"
            role="dialog"
            aria-modal="true"
            aria-label={`وصلت للمستوى ${newLevel}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-black/75 p-4 backdrop-blur-sm"
          >
            {/* confetti burst (CSS-only; auto-hidden under reduced-motion) */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              {CONFETTI.map((c, i) => (
                <span
                  key={i}
                  className="confetti-pc"
                  style={{
                    left: `${c.left}%`,
                    background: c.color,
                    animationDelay: `${c.delay}s`,
                    animationDuration: `${c.duration}s`,
                  }}
                />
              ))}
            </div>

            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.85, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className="panel panel-accent relative w-full max-w-sm overflow-hidden p-6 text-center"
            >
              {/* radial light-burst behind the emblem */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(60% 48% at 50% 32%, color-mix(in oklch, var(--gold) 22%, transparent), transparent 70%)",
                }}
              />

              <div className="relative">
                <div className="text-[0.7rem] font-bold tracking-[0.3em] text-gold/80">🎉 ترقية</div>
                <h2 className="mt-1 text-lg font-black">وصلت للمستوى</h2>

                {/* animated, glowing level emblem — the hero number */}
                <motion.div
                  initial={{ scale: 0, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 240, damping: 12, delay: 0.12 }}
                  className="glow-gold badge-shine mx-auto my-4 grid size-28 place-items-center rounded-full border-2 border-gold/60 bg-gradient-to-b from-gold/25 to-card"
                >
                  <span className="num text-6xl font-black text-gold [text-shadow:0_2px_16px_color-mix(in_oklch,var(--gold)_50%,transparent)]">
                    {newLevel}
                  </span>
                </motion.div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  صار بإمكانك سحب{" "}
                  <span className="num font-black text-gold">{dailyBank}</span> كوين يوميًا من البنك 🏦
                </p>

                <Button onClick={() => setOpen(false)} size="lg" className="btn-gold-cta mt-6 w-full">
                  متابعة
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
