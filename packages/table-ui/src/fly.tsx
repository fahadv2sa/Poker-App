"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// ── Position-measurement helper (the "travel" effects read live DOM rects) ────
type Pt = { x: number; y: number };

/** Centre of the first element matching `selector`, in viewport coords, or null if
 *  it isn't mounted. Used to fly chips/coins/stars between real on-screen anchors
 *  tagged with `data-fx="…"`. Read-only — never mutates anything. */
export function rectCenter(selector: string): Pt | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ── Fly context: spawn a sprite flight between two data-fx anchors ─────────────
export type FlyKind = "chip" | "coin" | "star";
export type FlyOpts = { from: string; to: string; kind: FlyKind; label?: string; count?: number };
type FlyApi = { fly: (o: FlyOpts) => void };
const FlyContext = createContext<FlyApi>({ fly: () => {} });
export const useFly = () => useContext(FlyContext);

type Flight = { id: number; from: Pt; to: Pt; kind: FlyKind; label?: string; delay: number; rot: number };

const SIZE = 26; // px — half-size offset so the transform centres the sprite
const MAX_SPRITES = 10; // hard safety cap on concurrent sprites per burst (mobile)
const rand = (n: number) => (Math.random() - 0.5) * n;

function ChipSprite({ label }: { label?: string }) {
  return (
    <span
      className="grid place-items-center rounded-full border-2 border-gold/70 bg-[#0b0908] text-[0.6rem] font-black text-gold shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
      style={{ width: SIZE, height: SIZE }}
    >
      {label ? <span className="num leading-none">{label}</span> : "🪙"}
    </span>
  );
}

function CoinSprite() {
  return (
    <span
      className="grid place-items-center rounded-full border border-gold/70 bg-gold/90 text-[0.7rem] shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
      style={{ width: SIZE - 6, height: SIZE - 6 }}
    >
      🪙
    </span>
  );
}

function StarSprite() {
  return (
    <span
      className="grid place-items-center text-[1rem] text-[var(--lu-gold-1)] drop-shadow-[0_0_6px_rgba(255,179,71,0.7)]"
      style={{ width: SIZE - 4, height: SIZE - 4 }}
    >
      ★
    </span>
  );
}

/**
 * Generic fly provider: holds the flight overlay and exposes `fly()` via `useFly()`.
 * Bus-agnostic — each game wires its own triggers (Link Up: chip/coin on bet/payout;
 * Top Ten: star/points on reveal). When `enabled` is false (or reduced-motion) it
 * renders nothing extra and `fly()` is a no-op, so the table is unaffected.
 */
export function FlyProvider({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const idRef = useRef(0);
  const reduced = useReducedMotion();
  const active = enabled && !reduced;

  const fly = useCallback(
    (o: FlyOpts) => {
      if (!active) return;
      const from = rectCenter(o.from);
      const to = rectCenter(o.to);
      if (!from || !to) return; // anchor not on screen → skip silently
      const count = Math.max(1, Math.min(MAX_SPRITES, o.count ?? 1));
      const scatter = count > 1;
      setFlights((cur) => {
        const next = [...cur];
        for (let i = 0; i < count; i++) {
          next.push({
            id: ++idRef.current,
            from: { x: from.x + (scatter ? rand(34) : 0), y: from.y + (scatter ? rand(26) : 0) },
            to: { x: to.x + (scatter ? rand(18) : 0), y: to.y + (scatter ? rand(14) : 0) },
            kind: o.kind,
            label: i === 0 ? o.label : undefined,
            delay: i * 0.05, // staggered timing
            rot: scatter ? rand(50) : 0,
          });
        }
        return next;
      });
    },
    [active],
  );

  const remove = (id: number) => setFlights((c) => c.filter((f) => f.id !== id));

  return (
    <FlyContext.Provider value={{ fly }}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
        <AnimatePresence>
          {flights.map((f) => (
            <motion.div
              key={f.id}
              initial={{ x: f.from.x - SIZE / 2, y: f.from.y - SIZE / 2, opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{
                x: f.to.x - SIZE / 2,
                y: f.to.y - SIZE / 2,
                opacity: [0, 1, 1, 0],
                scale: [0.4, 1, 1, 0.7],
                rotate: f.rot,
              }}
              transition={{ duration: 0.6, delay: f.delay, ease: "easeOut", times: [0, 0.18, 0.82, 1] }}
              onAnimationComplete={() => remove(f.id)}
              style={{ position: "fixed", left: 0, top: 0 }}
            >
              {f.kind === "chip" ? <ChipSprite label={f.label} /> : f.kind === "coin" ? <CoinSprite /> : <StarSprite />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </FlyContext.Provider>
  );
}

// ── Confetti (decorative, deterministic so there's no hydration mismatch) ─────
const CONFETTI_COLORS = ["var(--lu-gold-1)", "var(--lu-ember)", "var(--lu-ember-glow)", "#fff4cf"];
export const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37 + 5) % 100,
  delay: (i % 10) * 0.32,
  duration: 2.8 + (i % 5) * 0.5,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
}));
