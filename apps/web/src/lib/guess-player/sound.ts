"use client";

/**
 * Sound layer for Guess the Player — same architecture as Top Ten's
 * (lib/top-10/sound.ts): cues SYNTHESIZED via Web Audio (no asset files),
 * muted state in localStorage, context unlocks on first gesture,
 * fire-and-forget, never throws. Cues are tuned to this game's identity:
 * detective-y question blips, a big celebratory crack for the correct guess.
 */
export type GpSound =
  | "turn" // your turn began
  | "tick" // urgency tick near turn timeout
  | "yes" // question answered YES
  | "no" // question answered NO
  | "unknown" // «لا يمكن الإجابة»
  | "wrongGuess"
  | "correctGuess" // the big moment
  | "roundStart"
  | "reveal" // round ended unsolved → the hidden player is revealed
  | "win" // winner screen celebration
  | "countTick"; // new-round countdown ticks on the winner screen

const MUTE_KEY = "gp_muted";
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
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function voice(
  freq: number,
  start: number,
  dur: number,
  {
    gain = 0.18,
    type = "sine",
    glideTo,
    vibrato = 0,
  }: { gain?: number; type?: OscillatorType; glideTo?: number; vibrato?: number } = {},
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

function bell(freq: number, start: number, dur = 0.5, gain = 0.16) {
  voice(freq, start, dur, { gain, type: "sine" });
  voice(freq * 2, start, dur * 0.7, { gain: gain * 0.4, type: "sine" });
  voice(freq * 3.01, start, dur * 0.5, { gain: gain * 0.18, type: "sine" });
}

function sparkle(start: number, gain = 0.06) {
  [1568, 2093, 2637].forEach((f, i) => voice(f, start + i * 0.05, 0.18, { gain, type: "triangle" }));
}

const CUES: Record<GpSound, () => void> = {
  // your turn: warm two-note rise (same family as Top Ten's turn cue)
  turn: () => {
    voice(660, 0, 0.16, { gain: 0.14, type: "triangle" });
    voice(990, 0.08, 0.2, { gain: 0.1, type: "sine", vibrato: 8 });
  },
  // urgency tick: short dry click, slightly tense
  tick: () => voice(1320, 0, 0.06, { gain: 0.1, type: "square" }),
  // YES: bright affirmative ding
  yes: () => bell(1047, 0, 0.4, 0.15),
  // NO: firm low two-step down
  no: () => {
    voice(392, 0, 0.16, { gain: 0.16, type: "triangle" });
    voice(262, 0.1, 0.22, { gain: 0.14, type: "triangle" });
  },
  // cannot answer: soft neutral wobble — clearly neither yes nor no
  unknown: () => voice(494, 0, 0.3, { gain: 0.1, type: "sine", vibrato: 14 }),
  // wrong guess: low thud (Top Ten's lock family)
  wrongGuess: () => {
    voice(160, 0, 0.26, { gain: 0.2, type: "square", glideTo: 70 });
    voice(90, 0, 0.32, { gain: 0.12, type: "sine" });
  },
  // THE moment — the case is cracked: rising bells into a sparkle shower
  correctGuess: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => bell(f, i * 0.09, 0.5, 0.17));
    sparkle(0.5, 0.08);
    sparkle(0.68, 0.06);
  },
  // round start: focused "case opened" blip
  roundStart: () => {
    voice(523, 0, 0.14, { gain: 0.13, type: "triangle" });
    voice(784, 0.09, 0.22, { gain: 0.11, type: "sine" });
  },
  // unsolved reveal: descending mystery resolve
  reveal: () => {
    voice(880, 0, 0.4, { gain: 0.11, type: "sawtooth", glideTo: 330 });
    bell(440, 0.3, 0.45, 0.12);
  },
  // winner screen: held major celebration + sparkle
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => voice(f, i * 0.09, 0.34, { gain: 0.18, type: "triangle" }));
    [523, 659, 784].forEach((f) => voice(f, 0.5, 0.75, { gain: 0.11, type: "sine" }));
    sparkle(0.52, 0.07);
  },
  // new-round countdown tick (winner screen)
  countTick: () => voice(988, 0, 0.07, { gain: 0.09, type: "square" }),
};

export const gpSound = {
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
  play(cue: GpSound) {
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
