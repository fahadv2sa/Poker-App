"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import type { TtSeatView } from "@fb/shared";

/**
 * Compact, collapsible live standings ribbon — answers "who's winning?" without the end
 * screen. A small toggle in the header expands a ranked list of seats by total points
 * (you highlighted). Collapsed by default to keep the table clean.
 */
export function TenStandings({ seats, meId }: { seats: TtSeatView[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const ranked = [...seats].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="num flex items-center gap-1 rounded-full border border-[var(--lu-gold-1)]/25 bg-black/40 px-2.5 py-0.5 text-[0.7rem] font-bold text-[var(--lu-tan)]"
      >
        🏅 الترتيب
        <span className="text-[0.6rem]">{open ? "▲" : "▼"}</span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-[var(--lu-gold-1)]/30 bg-[#0b0908]/95 p-1.5 shadow-2xl backdrop-blur"
          >
            {ranked.map((s, i) => (
              <div
                key={s.seat}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[0.72rem]",
                  s.userId === meId ? "bg-[var(--gold)]/12 text-[var(--lu-cream)]" : "text-[var(--lu-tan)]",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="num w-4 shrink-0 text-center font-black text-[var(--gold)]">{i + 1}</span>
                  <span className="truncate">{s.username}{s.isBot ? " 🤖" : ""}{s.userId === meId ? " (أنت)" : ""}</span>
                </span>
                <span className="num shrink-0 font-black text-[var(--gold)]">{s.totalPoints}</span>
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
