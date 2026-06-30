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

/** A single enveloped voice with an optional pitch glide and vibrato. The richer
 *  envelope (fast attack, smooth exponential release) + layering below give the cues
 *  body instead of the old dry single tones. */
function voice(
  freq: number,
  start: number,
  dur: number,
  { gain = 0.18, type = "sine", glideTo, vibrato = 0 }: { gain?: number; type?: OscillatorType; glideTo?: number; vibrato?: number } = {},
) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, glideTo), t0 + dur);
  if (vibrato > 0) {
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.setValueAtTime(6, t0);
    lfoGain.gain.setValueAtTime(vibrato, t0);
    lfo.connect(lfoGain).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

/** A bell-like ding — fundamental + softer inharmonic partials for a warm, ringing
 *  timbre (the signature "reveal" sound), far less dry than a lone sine. */
function bell(freq: number, start: number, dur = 0.5, gain = 0.16) {
  voice(freq, start, dur, { gain, type: "sine" });
  voice(freq * 2, start, dur * 0.7, { gain: gain * 0.4, type: "sine" });
  voice(freq * 3.01, start, dur * 0.5, { gain: gain * 0.18, type: "sine" });
}

/** A quick high shimmer layered onto celebratory cues. */
function sparkle(start: number, gain = 0.06) {
  [1568, 2093, 2637].forEach((f, i) => voice(f, start + i * 0.05, 0.18, { gain, type: "triangle" }));
}

const CUES: Record<TtSound, () => void> = {
  // a warm bell ding when a card is revealed
  reveal: () => bell(932, 0, 0.45, 0.16),
  // rank-10 jackpot: ascending bell arpeggio capped with a sparkle
  jackpot: () => {
    [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.1, 0.5, 0.18));
    sparkle(0.42, 0.07);
  },
  // hint reveal: a textured downward whoosh (two detuned saws) over a soft low pad
  hint: () => {
    voice(1200, 0, 0.42, { gain: 0.12, type: "sawtooth", glideTo: 240 });
    voice(1180, 0, 0.42, { gain: 0.08, type: "sawtooth", glideTo: 250 });
    voice(160, 0, 0.46, { gain: 0.08, type: "sine" });
  },
  // your turn: a warm two-note blip with a touch of vibrato
  turn: () => {
    voice(660, 0, 0.16, { gain: 0.14, type: "triangle" });
    voice(990, 0.08, 0.2, { gain: 0.1, type: "sine", vibrato: 8 });
  },
  // attempts exhausted: a low thud with body
  lock: () => {
    voice(160, 0, 0.26, { gain: 0.2, type: "square", glideTo: 70 });
    voice(90, 0, 0.32, { gain: 0.12, type: "sine" });
  },
  // match win: a rising run resolving into a held major chord + sparkle
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => voice(f, i * 0.09, 0.34, { gain: 0.18, type: "triangle" }));
    [523, 659, 784].forEach((f) => voice(f, 0.5, 0.75, { gain: 0.11, type: "sine" }));
    sparkle(0.52, 0.07);
  },
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
