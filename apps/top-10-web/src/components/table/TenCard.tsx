"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cn } from "@fb/top-10-ui";
import { CountUp } from "@fb/table-ui";
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
 * One rank slot of the Top Ten board (ranks never move; a slot reveals when its
 * player is named). HIDDEN = the rank + a ghost metric glyph + a soft shimmer ("find
 * me"). REVEALED = the player's photo (the hero) + a small name caption, with the
 * value badge beside it. Rank 10 (the jackpot) gets a special gold rim. Tap a
 * revealed card to expand. Sizing is HEIGHT-DRIVEN: the card fills its grid cell, the
 * photo is `h-full aspect-square`, so the whole board fits any phone with no scroll.
 */
export function TenCard({
  card,
  metricType,
  hintMode = false,
}: {
  card: TtCardView;
  metricType?: string;
  /** P2: red border cue when the system switches to hint mode. */
  hintMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const m = metricOf(metricType);
  const jackpot = card.rank === 10;
  const revealed = card.revealed && !!card.player;

  return (
    <>
      <div
        role={revealed ? "button" : undefined}
        tabIndex={revealed ? 0 : undefined}
        onClick={revealed ? () => setOpen(true) : undefined}
        onKeyDown={revealed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } } : undefined}
        className={cn(
          "relative flex h-full w-full items-stretch gap-1.5 overflow-hidden rounded-xl border px-1.5 transition",
          revealed ? "cursor-pointer bg-[color-mix(in_oklch,var(--gold)_9%,black)]" : "bg-black/35",
          hintMode
            ? "border-[var(--lu-ember)]/70"
            : jackpot
              ? "border-[var(--lu-gold-1)]/70 shadow-[0_0_12px_rgba(255,179,71,0.22)]"
              : revealed
                ? "border-[var(--gold)]/45"
                : "border-white/10",
        )}
      >
        {/* photo-hero (square, fills the cell height) */}
        <div className="relative my-1 aspect-square h-[calc(100%-0.5rem)] shrink-0 overflow-hidden rounded-lg">
          {revealed ? (
            card.player!.photoUrl ? (
              <img src={card.player!.photoUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover object-top" />
            ) : (
              <div className="grid size-full place-items-center bg-[#16120c] text-sm font-black text-white/45">
                {initials(card.player!.name)}
              </div>
            )
          ) : (
            <div className="grid size-full place-items-center bg-[repeating-linear-gradient(135deg,#0b0908,#0b0908_6px,#16120c_6px,#16120c_12px)]">
              <span className="animate-pulse text-lg opacity-30">{m.glyph}</span>
            </div>
          )}
          {/* rank badge — corner, always visible; jackpot gets a crown */}
          <span
            className={cn(
              "num absolute right-0.5 top-0.5 grid min-w-[1.25rem] place-items-center rounded-md px-1 text-[clamp(0.62rem,2.6vw,0.84rem)] font-black leading-tight",
              jackpot ? "bg-[var(--lu-gold-1)] text-black" : "bg-black/70 text-[var(--gold)]",
            )}
          >
            {jackpot ? "👑" : null}
            {card.rank}
          </span>
        </div>

        {/* side: name caption (revealed) + value badge */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1 pl-0.5">
          {revealed ? (
            <span className="truncate text-[clamp(0.66rem,3vw,0.9rem)] font-bold leading-tight text-[var(--lu-cream)]">
              {card.player!.nameAr}
            </span>
          ) : (
            <span className="text-[clamp(0.6rem,2.6vw,0.78rem)] leading-tight text-[var(--lu-tan)]/70">— مخفي —</span>
          )}
          <span
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full border px-1.5 py-0.5 text-[clamp(0.6rem,2.6vw,0.8rem)] font-bold",
              revealed
                ? "border-[var(--gold)]/40 bg-[var(--gold)]/10 text-[var(--gold)]"
                : "border-white/10 bg-white/[0.03] text-[var(--lu-tan)]/60",
            )}
            title={m.unitAr}
          >
            <span aria-hidden className="text-[0.9em] opacity-90">{m.glyph}</span>
            {revealed ? <span className="num font-black"><CountUp value={card.player!.value} /></span> : "—"}
          </span>
        </div>
      </div>

      {open && revealed
        ? createPortal(
            <ExpandModal card={card} metricType={metricType} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
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
          <span className="inline-flex items-center gap-1 text-base font-black"><span aria-hidden>{m.glyph}</span><span className="num">{p.value}</span> <span className="text-xs font-bold opacity-80">{m.unitAr}</span></span>
        </div>
        <div className="p-4">
          <div className="text-xl font-extrabold text-[var(--lu-cream)]">{p.nameAr}</div>
          <div className="mt-0.5 text-sm text-white/60">{p.name}</div>
        </div>
      </motion.div>
    </div>
  );
}
