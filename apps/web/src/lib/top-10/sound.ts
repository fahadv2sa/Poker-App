"use client";

/**
 * Tiny self-contained sound layer for the Top Ten table. Cues are SYNTHESIZED via the
 * Web Audio API (no asset files to ship/source — easily swapped for samples later).
 * Muted state persists in localStorage; the context unlocks on the first user gesture
 * (browser autoplay policy). Fire-and-forget; never throws.
 */
export type TtSound = "reveal" | "jackpot" | "hint" | "turn" | "lock" | "win";

const MUTE_KEY = "tt_muted";
let ctx: AudioContext | null = null;
let muted = false;

if (typeof window !== "undefined") {
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** A single enveloped tone. */
function tone(freq: number, start: number, dur: number, gain = 0.18, type: OscillatorType = "sine", glideTo?: number) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, glideTo), a.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

const CUES: Record<TtSound, () => void> = {
  reveal: () => tone(880, 0, 0.16, 0.16, "sine"),
  // ascending C5-E5-G5-C6 fanfare for the rank-10 jackpot
  jackpot: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.28, 0.2, "triangle")),
  hint: () => tone(1200, 0, 0.32, 0.14, "sawtooth", 240), // downward whoosh
  turn: () => { tone(660, 0, 0.14, 0.14); tone(990, 0.08, 0.16, 0.12); },
  lock: () => tone(150, 0, 0.22, 0.2, "square", 80), // low thud
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, 0.2, "triangle")),
};

export const ttSound = {
  get muted() {
    return muted;
  },
  setMuted(v: boolean) {
    muted = v;
    try {
      localStorage.setItem(MUTE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  },
  toggle(): boolean {
    this.setMuted(!muted);
    return muted;
  },
  /** Resume the context after a user gesture (autoplay policy). */
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") void a.resume();
  },
  play(cue: TtSound) {
    if (muted) return;
    const a = ac();
    if (!a) return;
    if (a.state === "suspended") void a.resume();
    try {
      CUES[cue]?.();
    } catch {
      /* ignore */
    }
  },
};
