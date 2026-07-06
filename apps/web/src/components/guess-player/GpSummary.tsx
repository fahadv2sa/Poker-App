"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import type { GpRevealEvent, GpStateView } from "@fb/shared";

/** One completed round, captured from its gp:reveal event. */
export type GpRoundSummary = Pick<
  GpRevealEvent,
  "reason" | "player" | "winnerSeat" | "winnerPoints" | "pickerSeat" | "pickerPoints"
>;

/**
 * The table summary — shown when leaving after ≥1 completed round (early exit
 * or after the winner announcement). PER-ROUND SUMMARIES AND NOTHING ELSE
 * (final ruling): each round is a COLLAPSED row (round number + cracked/
 * timed-out) that expands to the hidden player, who cracked it, and the
 * points. Final standings live ONLY on the winner announcement screen.
 * Rounds are numbered by SESSION order (replays keep accumulating).
 */
export function GpSummary({
  rounds,
  seats,
  meId,
  onClose,
}: {
  rounds: GpRoundSummary[];
  seats: GpStateView["seats"];
  meId: string;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const nameOf = (seat: number | null) => {
    const s = seats.find((x) => x.seat === seat);
    if (!s) return "—";
    return s.userId === meId ? "أنت" : s.username;
  };
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-[var(--lu-abyss)]/95 p-3 backdrop-blur-md sm:p-6"
    >
      <div className="my-auto w-full max-w-md space-y-3">
        {/* header */}
        <div className="lu-frame flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="lu-gold-text lu-gold-title text-base font-black">ملخص الطاولة</span>
            <span className="num text-[0.7rem] text-[var(--lu-tan)]">
              {rounds.length} {rounds.length === 1 ? "جولة مكتملة" : "جولات مكتملة"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--lu-gold-1)]/25 bg-black/40 text-lg text-[var(--lu-cream)]/85"
          >
            ✕
          </button>
        </div>

        {/* collapsed round rows */}
        <div className="space-y-2">
          {rounds.map((rd, i) => {
            const solved = rd.reason === "CORRECT_GUESS";
            const isOpen = open.has(i);
            return (
              <div key={i} className="lu-frame overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="text-sm font-bold text-[var(--lu-cream)]">
                    الجولة <span className="num">{i + 1}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.66rem] font-bold ring-1",
                        solved
                          ? "text-[var(--lu-gold-1)] ring-[var(--lu-gold-1)]/40"
                          : "text-[var(--lu-tan)] ring-white/20",
                      )}
                    >
                      {solved ? "🎯 كُشف" : "⏱ انتهى الوقت"}
                    </span>
                    <span aria-hidden className="text-[0.6rem] text-[var(--lu-tan)]">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </span>
                </button>
                {isOpen ? (
                  <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 fade-rise">
                    {rd.player.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={rd.player.photoUrl}
                        alt={rd.player.nameAr ?? rd.player.name}
                        className="size-11 shrink-0 rounded-full object-cover ring-1 ring-[var(--lu-gold-1)]/40"
                      />
                    ) : (
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lu-gold-2)]/15 text-lg ring-1 ring-[var(--lu-gold-1)]/40">
                        ⚽
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-black text-[var(--lu-gold-1)]">
                        {rd.player.nameAr ?? rd.player.name}
                      </div>
                      <div className="truncate text-[0.7rem] text-[var(--lu-tan)]">
                        {solved ? (
                          <>
                            كشفه <b className="text-[var(--lu-cream)]">{nameOf(rd.winnerSeat)}</b>
                          </>
                        ) : (
                          "لم يخمّنه أحد"
                        )}
                        {rd.pickerSeat != null && rd.pickerPoints > 0 ? (
                          <>
                            {" · "}المنتقي {nameOf(rd.pickerSeat)}{" "}
                            <span className="num text-[var(--lu-gold-1)]">+{rd.pickerPoints}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {solved ? (
                      <span className="num shrink-0 text-lg font-black text-[var(--gold)]">
                        +{rd.winnerPoints}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
