"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type RevealDisplay = {
  /** Monotonic id — a new id (re)triggers the notice even for a repeated rank. */
  id: number;
  /** Contestant who guessed (null = auto-revealed on hint exhaustion). */
  byName: string | null;
  isMe: boolean;
  playerNameAr: string;
  rank: number;
  points: number;
  photoUrl: string | null;
};

/**
 * The big "someone guessed correctly" notice — center stage, fades out. Two lines as
 * asked: the contestant on top, the guessed player below, with a rank/points chip.
 * Queue-safe: rapid reveals are shown one after another. Rank 10 gets gold emphasis
 * (the full jackpot celebration — confetti/star shower — lands in P3).
 */
export function TenRevealNotice({ latest }: { latest: RevealDisplay | null }) {
  const [queue, setQueue] = useState<RevealDisplay[]>([]);
  const [current, setCurrent] = useState<RevealDisplay | null>(null);
  const lastId = useRef(0);

  useEffect(() => {
    if (latest && latest.id !== lastId.current) {
      lastId.current = latest.id;
      setQueue((q) => [...q, latest]);
    }
  }, [latest]);

  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]!);
      setQueue((q) => q.slice(1));
    }
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    const dur = current.rank === 10 ? 2600 : 2000;
    const t = setTimeout(() => setCurrent(null), dur);
    return () => clearTimeout(t);
  }, [current]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[28%] z-[80] flex justify-center px-4">
      <AnimatePresence mode="wait">
        {current ? (
          current.rank === 10 ? (
            // ── RANK-10 JACKPOT — a distinct, celebratory notice (confetti fires too) ──
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 0.5, rotate: -4 }}
              animate={{ opacity: 1, scale: [0.5, 1.12, 1], rotate: 0 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ type: "spring", stiffness: 240, damping: 14 }}
              className="max-w-[64vw] overflow-hidden rounded-2xl border-2 border-[var(--lu-gold-1)] bg-gradient-to-b from-[var(--lu-gold-2)]/40 to-[#0b0908]/95 px-5 py-3 text-center shadow-[0_0_40px_rgba(255,179,71,0.6)] backdrop-blur"
            >
              <div className="text-2xl">🏆</div>
              <div className="lu-gold-text lu-gold-title text-lg font-black leading-tight">المركز العاشر!</div>
              {current.byName ? <div className="mt-0.5 truncate text-sm font-bold text-[var(--lu-ember-glow)]">{current.byName}</div> : null}
              <div className="truncate text-xl font-black text-[var(--lu-cream)]">{current.playerNameAr}</div>
            </motion.div>
          ) : (
            // ── normal reveal — compact, kept narrow so it never touches the cards ──
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 0.7, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.08, y: -8 }}
              transition={{ type: "spring", stiffness: 280, damping: 20 }}
              className="max-w-[52vw] rounded-2xl border border-[var(--lu-gold-1)]/40 bg-[#0b0908]/92 px-4 py-2.5 text-center shadow-2xl backdrop-blur"
            >
              {current.byName ? <div className="truncate text-sm font-bold text-[var(--lu-ember-glow)]">{current.byName}</div> : null}
              <div className="truncate text-xl font-black text-[var(--lu-cream)]">{current.playerNameAr}</div>
            </motion.div>
          )
        ) : null}
      </AnimatePresence>
    </div>
  );
}
