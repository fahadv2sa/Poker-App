"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ANIMATIONS_ENABLED, anim } from "@/lib/anim";
import { fxBus } from "@/lib/fx-bus";
import { cn } from "@/lib/utils";

// ── Position-measurement helper (the "travel" effects read live DOM rects) ────
type Pt = { x: number; y: number };

/** Centre of the first element matching `selector`, in viewport coords, or null
 *  if it isn't mounted. Used to fly chips/coins between real on-screen anchors
 *  tagged with `data-fx="…"`. Read-only — never mutates anything. */
export function rectCenter(selector: string): Pt | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ── Fly context: spawn a chip/coin flight between two data-fx anchors ─────────
type FlyOpts = { from: string; to: string; kind: "chip" | "coin"; label?: string; count?: number };
type FxApi = { fly: (o: FlyOpts) => void };
const FxContext = createContext<FxApi>({ fly: () => {} });
export const useFx = () => useContext(FxContext);

type Flight = { id: number; from: Pt; to: Pt; kind: "chip" | "coin"; label?: string; delay: number; rot: number };

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

/**
 * FX provider: holds the fly overlay, the all-in flash, and exposes `fly()`.
 * Always safe to mount — when animations are off (or reduced-motion) it renders
 * nothing extra and `fly()` is a no-op, so the table is unaffected.
 */
export function FxProvider({ children }: { children: ReactNode }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flash, setFlash] = useState(0); // bumped to retrigger the all-in flash
  const idRef = useRef(0);
  const reduced = useReducedMotion();
  const active = ANIMATIONS_ENABLED && !reduced;

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
            // Fan out from the seat, and land slightly spread across the pot so
            // chips don't perfectly stack — reads as a scatter, not one sprite.
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

  // #3 chip scatter (every coin-contributing action: bet / raise / call / all-in)
  // + #12 all-in flash both ride the fx bus. All-in gets BOTH: the chips because
  // it pushes money, plus the gold flash as its signature (different layers, no
  // double-up of the same effect).
  useEffect(() => {
    if (!active) return;
    return fxBus.on((e) => {
      if (e.type === "bet" && anim("chipTravel")) {
        // A tasteful handful, scaling modestly with the amount but capped at 7.
        const count = Math.max(3, Math.min(7, 3 + Math.floor(e.amount / 120)));
        fly({ from: `[data-fx="seat-${e.seat}"]`, to: `[data-fx="pot"]`, kind: "chip", label: `+${e.amount}`, count });
      } else if (e.type === "allin" && anim("allInBeat")) {
        setFlash((n) => n + 1);
      }
    });
  }, [active, fly]);

  const remove = (id: number) => setFlights((c) => c.filter((f) => f.id !== id));

  return (
    <FxContext.Provider value={{ fly }}>
      {children}

      {/* Travel sprites */}
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
              {f.kind === "chip" ? <ChipSprite label={f.label} /> : <CoinSprite />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* #12 all-in gold flash */}
      <AnimatePresence>
        {flash > 0 ? (
          <motion.div
            key={flash}
            className="pointer-events-none fixed inset-0 z-[55]"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            onAnimationComplete={() => setFlash(0)}
            style={{
              background:
                "radial-gradient(120% 80% at 50% 50%, transparent 55%, color-mix(in oklch, var(--gold) 55%, transparent))",
            }}
          />
        ) : null}
      </AnimatePresence>
    </FxContext.Provider>
  );
}

// ── #1 Turn-timer FRAME ──────────────────────────────────────────────────────
/**
 * A rounded-rectangle outline that traces the active player's profile-card
 * border and depletes around the perimeter as the turn runs out. It overlays the
 * whole seat card (absolute inset-0) and measures the card so it's pixel-aligned
 * on every seat and at any size — never offset. `pathLength={100}` normalizes the
 * stroke so the depletion math is correct without computing the real perimeter.
 *
 * Driven purely by the server-authoritative `remainingMs` the seat already
 * computes (no new timer); GPU-friendly stroke-only; emits nothing to the server.
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

// ── #4 Pot count-up ──────────────────────────────────────────────────────────
/** Tweens a displayed integer toward `value`. Decorative only — `value` is the
 *  already-authoritative pot, so the final frame always equals the real number. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!anim("potCountUp") || reduced) {
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
  }, [value, reduced]);

  useEffect(() => {
    fromRef.current = value;
  }, [value]);

  return <span className={className}>{shown}</span>;
}

// ── #10 Street-transition flourish ───────────────────────────────────────────
/** Briefly flashes the new street's Arabic name over the table when `phase`
 *  changes to a community street. Mounts/unmounts itself; no layout impact. */
export function StreetFlourish({ phase }: { phase: string }) {
  const LABELS: Record<string, string> = {
    FLOP: "الفلوب",
    TURN: "التيرن",
    RIVER: "الريفر",
    SHOWDOWN: "الكشف",
  };
  const [show, setShow] = useState<string | null>(null);
  const prev = useRef(phase);

  useEffect(() => {
    if (prev.current !== phase && anim("streetFlourish") && LABELS[phase]) {
      setShow(LABELS[phase]);
      const t = setTimeout(() => setShow(null), 1100);
      prev.current = phase;
      return () => clearTimeout(t);
    }
    prev.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/3 z-40 flex justify-center" aria-hidden>
      <AnimatePresence>
        {show ? (
          <motion.div
            key={show}
            initial={{ opacity: 0, scale: 0.7, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={cn(
              "rounded-2xl border border-[var(--lu-gold-1)]/40 bg-[#0b0908]/80 px-8 py-3 text-2xl font-black text-[var(--lu-gold-1)]",
              "shadow-2xl backdrop-blur",
            )}
          >
            {show}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
