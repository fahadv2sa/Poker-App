"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";

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

function initials(name: string): string {
  const p = name.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  return p.length ? (p[0]![0]! + (p[p.length - 1]?.[0] ?? "")).toUpperCase() : "؟";
}

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
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.08, y: -8 }}
            transition={{ type: "spring", stiffness: 280, damping: 20 }}
            className={cn(
              "flex max-w-[92vw] items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur",
              current.rank === 10
                ? "border-[var(--lu-gold-1)]/80 bg-[#0b0908]/90 shadow-[0_0_30px_rgba(255,179,71,0.45)]"
                : "border-[var(--lu-gold-1)]/40 bg-[#0b0908]/88",
            )}
          >
            <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--lu-gold-1)]/40 bg-[#16120c]">
              {current.photoUrl ? (
                <img src={current.photoUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover object-top" />
              ) : (
                <span className="text-sm font-black text-white/50">{initials(current.playerNameAr)}</span>
              )}
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate text-[0.78rem] font-bold text-[var(--lu-ember-glow)]">
                {current.rank === 10 ? "🏆 " : "✓ "}
                {current.byName ? `${current.isMe ? "أنت" : current.byName} خمّن` : "كُشِف تلقائيًا"}
              </div>
              <div className="truncate text-lg font-black text-[var(--lu-cream)]">{current.playerNameAr}</div>
            </div>
            <div className="num shrink-0 rounded-xl border border-[var(--lu-gold-1)]/40 bg-[var(--gold)]/10 px-2.5 py-1 text-center">
              <div className="text-[0.55rem] font-bold text-[var(--lu-tan)]">المركز {current.rank}</div>
              <div className="text-base font-black leading-none text-[var(--gold)]">+{current.points}</div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
