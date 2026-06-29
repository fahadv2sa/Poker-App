"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "./cn.js";

/** Live remaining time (ms) until `deadlineTs`, re-rendered ~4×/sec. */
export function useRemainingMs(deadlineTs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineTs == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadlineTs]);
  if (deadlineTs == null) return null;
  return Math.max(0, deadlineTs - now);
}

/**
 * A live, numeric countdown for a turn / window. `compact` is the small seat badge;
 * otherwise a labelled number + draining bar. The caller passes the server's
 * authoritative `deadlineTs`; this just renders it ticking. `totalMs` scales the bar
 * (default 30s — Link Up's turn timer; other windows pass their own).
 */
export function Countdown({
  deadlineTs,
  totalMs = 30_000,
  compact = false,
}: {
  deadlineTs: number | null;
  totalMs?: number;
  compact?: boolean;
}) {
  const remMs = useRemainingMs(deadlineTs);
  if (remMs == null) return null;
  const secs = Math.ceil(remMs / 1000);
  const pct = Math.max(0, Math.min(100, (remMs / totalMs) * 100));
  const danger = secs <= 10;

  if (compact) {
    return (
      <span
        className={cn(
          "num rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold tabular-nums",
          danger ? "bg-[var(--lu-ember)]/20 text-[var(--lu-ember-glow)]" : "bg-[var(--lu-gold-2)]/15 text-[var(--lu-gold-1)]",
        )}
      >
        {secs}
      </span>
    );
  }
  return (
    <div className="flex w-full max-w-[260px] flex-col items-center gap-1">
      <span
        className={cn(
          "num text-sm font-bold tabular-nums",
          danger ? "text-[var(--lu-ember-glow)]" : "text-[var(--lu-gold-1)]",
        )}
      >
        ⏱ {secs} ث
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            danger ? "bg-[var(--lu-ember)]" : "bg-linear-to-l from-[var(--lu-gold-1)] to-[var(--lu-ember)]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A rounded-rectangle outline that traces a card's border and depletes around the
 * perimeter as a timer runs out. Overlays the parent (absolute inset-0) and measures
 * it so it's pixel-aligned at any size. `pathLength={100}` normalizes the stroke so
 * the depletion math needs no real perimeter. Driven purely by `remainingMs`
 * (server-authoritative); GPU-friendly stroke-only.
 */
export function TurnFrame({
  remainingMs,
  totalMs = 60_000,
  radius = 16, // matches the seat card's rounded-2xl (1rem)
  stroke = 2.5,
}: {
  remainingMs: number | null;
  totalMs?: number;
  radius?: number;
  stroke?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const card = ref.current?.parentElement; // the seat card (position: relative)
    if (!card) return;
    const measure = () => setSize({ w: card.clientWidth, h: card.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  if (remainingMs == null) return null;
  const pct = Math.max(0, Math.min(1, remainingMs / totalMs));
  const danger = remainingMs <= 10_000;

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" aria-hidden>
      {size ? (
        <svg width={size.w} height={size.h} className="absolute inset-0 overflow-visible">
          <rect
            x={stroke / 2}
            y={stroke / 2}
            width={Math.max(0, size.w - stroke)}
            height={Math.max(0, size.h - stroke)}
            rx={Math.max(0, radius - stroke / 2)}
            ry={Math.max(0, radius - stroke / 2)}
            fill="none"
            stroke={danger ? "var(--lu-ember)" : "var(--lu-gold-1)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 * (1 - pct)}
            style={{ transition: reduced ? "none" : "stroke-dashoffset 0.25s linear" }}
          />
        </svg>
      ) : null}
    </div>
  );
}

/**
 * Tweens a displayed integer toward `value` (decorative; the final frame always
 * equals the real number). `enabled=false` or reduced-motion snaps instantly. The
 * caller decides whether to mount/animate (e.g. behind an animation flag).
 */
export function CountUp({
  value,
  enabled = true,
  className,
}: {
  value: number;
  enabled?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!enabled || reduced) {
      setShown(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const dur = 450;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, enabled, reduced]);

  useEffect(() => {
    fromRef.current = value;
  }, [value]);

  return <span className={className}>{shown}</span>;
}

/**
 * A large CINEMATIC circular countdown: a depleting ember ring with a big number that
 * pops each second. For a center-stage moment (Top Ten's pre-hint countdown). Driven
 * by server-authoritative `remainingMs`/`totalMs`; pure stroke + a per-second scale pop.
 */
export function CircularCountdown({
  remainingMs,
  totalMs,
  size = 132,
  stroke = 9,
}: {
  remainingMs: number | null;
  totalMs: number;
  size?: number;
  stroke?: number;
}) {
  const reduced = useReducedMotion();
  if (remainingMs == null) return null;
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const pct = Math.max(0, Math.min(1, remainingMs / totalMs));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--lu-ember)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: reduced ? "none" : "stroke-dashoffset 0.25s linear", filter: "drop-shadow(0 0 6px rgba(255,106,26,0.6))" }}
        />
      </svg>
      <motion.span
        key={secs}
        initial={reduced ? false : { scale: 0.6, opacity: 0.5 }}
        animate={reduced ? undefined : { scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
        className="num text-5xl font-black text-[var(--lu-ember-glow)]"
      >
        {secs}
      </motion.span>
    </div>
  );
}
