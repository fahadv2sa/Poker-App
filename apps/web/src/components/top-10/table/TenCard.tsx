"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import { CountUp, TurnFrame, useRemainingMs } from "@fb/table-ui";
import type { TtCardView } from "@fb/shared";
import { metricOf } from "./metric";

/** Up-to-two-letter initials for the photo fallback. */
function initials(name: string): string {
  const parts = name.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * One rank slot — a compact portrait card on the felt (height-driven: `h-full` of its
 * grid row, portrait aspect).
 *  - HIDDEN  = a uniform face-down playing card (Link Up's diagonal card-back) with the
 *              rank number on the back; identical for every hidden slot.
 *  - REVEALED= the player's PHOTO fills the frame, with ONLY the rank (top) and the bare
 *              stat number (bottom) — no name, no emoji/glyph. Tap to expand for details.
 * Rank 10 (the jackpot) gets a gold rim; hint mode tints the back/border ember-red.
 */
export function TenCard({
  card,
  metricType,
  hintMode = false,
  anchor,
  hintTimerDeadlineTs = null,
  hintTimerTotalMs = 30_000,
}: {
  card: TtCardView;
  metricType?: string;
  hintMode?: boolean;
  anchor?: string;
  /** When this hidden card is the hint's TARGET during the open answer window, a
   *  depleting border timer traces its frame (same style as the player-card timer). */
  hintTimerDeadlineTs?: number | null;
  hintTimerTotalMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const hintRemMs = useRemainingMs(hintTimerDeadlineTs);
  const jackpot = card.rank === 10;
  const revealed = card.revealed && !!card.player;

  const frame = "relative h-full aspect-[3/4] overflow-hidden rounded-lg border shadow-[0_4px_10px_rgba(0,0,0,0.45)]";

  if (!revealed) {
    // Uniform face-down card back (Link Up's flipped-card style) + the rank, nothing else.
    return (
      <div
        data-fx={anchor}
        aria-label={`بطاقة مغلقة — المركز ${card.rank}`}
        className={cn(
          frame,
          "grid place-items-center [background:repeating-linear-gradient(135deg,#0b0908,#0b0908_7px,#16120c_7px,#16120c_14px)] shadow-[inset_0_1px_0_rgba(255,234,180,0.08)]",
          hintMode ? "border-[var(--lu-ember)]/70" : jackpot ? "border-[var(--lu-gold-1)]/55" : "border-[var(--lu-gold-1)]/30",
        )}
      >
        <span className="num text-[clamp(1.2rem,6vw,2rem)] font-black text-[var(--lu-gold-1)]/80">{card.rank}</span>
        {hintTimerDeadlineTs != null ? <TurnFrame remainingMs={hintRemMs} totalMs={hintTimerTotalMs} radius={8} stroke={3} /> : null}
      </div>
    );
  }

  const p = card.player!;
  return (
    <>
      <div
        data-fx={anchor}
        role="button"
        tabIndex={0}
        aria-label={`المركز ${card.rank}: ${p.nameAr}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        className={cn(
          frame,
          "cursor-pointer bg-[#16120c]",
          hintMode ? "border-[var(--lu-ember)]/60" : jackpot ? "border-[var(--lu-gold-1)]/80 shadow-[0_0_12px_rgba(255,179,71,0.3)]" : "border-[var(--lu-gold-1)]/45",
        )}
      >
        {/* photo fills the frame */}
        {p.photoUrl ? (
          <img src={p.photoUrl} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover object-top" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#1b160e] to-[#0b0908] text-[clamp(0.9rem,4vw,1.4rem)] font-black text-white/40">
            {initials(p.name)}
          </div>
        )}

        {/* rank — top-right: a "#N" POSITION chip, deliberately styled apart from the
            gold stat below (cream text + gold ring, with a "#" marker, no glyph/emoji) so
            a small stat value can never be mistaken for the rank. Jackpot stays gold. */}
        <span
          className={cn(
            "num absolute right-1 top-1 inline-flex items-center gap-px rounded-md px-1.5 text-[clamp(0.6rem,2.7vw,0.82rem)] font-black leading-tight ring-1",
            jackpot
              ? "bg-[var(--lu-gold-1)] text-black ring-[var(--lu-gold-1)]"
              : "bg-black/80 text-[var(--lu-cream)] ring-[var(--lu-gold-1)]/60",
          )}
        >
          <span className="text-[0.72em] font-bold opacity-70">#</span>
          {card.rank}
        </span>

        {/* stat number — bottom strip, bare number only (no glyph) */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pb-0.5 pt-3 text-center">
          <span className="num text-[clamp(0.74rem,3.4vw,1.05rem)] font-black leading-none text-[var(--gold)]">
            <CountUp value={p.value} />
          </span>
        </div>
      </div>

      {open ? createPortal(<ExpandModal card={card} metricType={metricType} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

function ExpandModal({ card, metricType, onClose }: { card: TtCardView; metricType?: string; onClose: () => void }) {
  const m = metricOf(metricType);
  const p = card.player!;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[80vw] max-w-[320px] overflow-hidden rounded-2xl border border-[var(--lu-gold-1)]/40 bg-gradient-to-b from-[#16120c] to-[#0b0908] text-center shadow-2xl"
      >
        <button onClick={onClose} aria-label="إغلاق" className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-black/60 text-lg text-white/85">✕</button>
        <div className="aspect-[4/5] w-full overflow-hidden bg-[#0b0908]">
          {p.photoUrl ? (
            <img src={p.photoUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover object-top" />
          ) : (
            <div className="grid size-full place-items-center text-6xl font-black text-white/40">{initials(p.name)}</div>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 border-y border-[var(--lu-gold-1)]/25 bg-[var(--gold)]/10 py-1.5 text-[var(--gold)]">
          <span className="num rounded-md bg-black/40 px-2 text-sm font-black">المركز {card.rank}</span>
          <span className="num text-base font-black">{p.value} <span className="text-xs font-bold opacity-80">{m.unitAr}</span></span>
        </div>
        <div className="p-4">
          <div className="text-xl font-extrabold text-[var(--lu-cream)]">{p.nameAr}</div>
          <div className="mt-0.5 text-sm text-white/60">{p.name}</div>
        </div>
      </motion.div>
    </div>
  );
}
