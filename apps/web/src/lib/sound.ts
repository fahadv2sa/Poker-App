"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-only game sound system. All clips are short MP3s in /public/sounds,
 * preloaded once and played via the Web Audio API (so identical sounds can
 * overlap with low latency). Mute/volume persist in localStorage. Honors the
 * browser autoplay policy: the AudioContext starts suspended and is resumed on
 * the first user gesture (see unlock()). Sounds are a pure reaction to the
 * existing Socket.IO game events — there is no server involvement.
 *
 * Files map 1:1 to game events (see useGameSocket.ts). All assets are from
 * Mixkit under the Mixkit Free License (commercial use, no attribution).
 */
export const SOUND_NAMES = [
  "deal",
  "flip",
  "shuffle",
  "chip",
  "check",
  "allin",
  "fold",
  "your-turn",
  "timer-warning",
  "showdown",
  "win",
  "lose",
  "notify",
  "click",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

const LS_MUTED = "fp.sound.muted";
const LS_VOLUME = "fp.sound.volume";
const DEFAULT_VOLUME = 0.7;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private unlocked = false;
  muted = false;
  volume = DEFAULT_VOLUME;
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window === "undefined") return;
    this.muted = window.localStorage.getItem(LS_MUTED) === "1";
    const v = Number.parseFloat(window.localStorage.getItem(LS_VOLUME) ?? "");
    if (!Number.isNaN(v)) this.volume = clamp01(v);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    for (const l of this.listeners) l();
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Fetch + decode every clip once. Idempotent. */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    const ctx = this.ensureCtx();
    if (!ctx) return Promise.resolve();
    this.loading = Promise.all(
      SOUND_NAMES.map(async (name) => {
        try {
          const res = await fetch(`/sounds/${name}.mp3`);
          if (!res.ok) return;
          const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, decoded);
        } catch {
          /* a missing/failed clip just stays silent — never throws */
        }
      }),
    ).then(() => undefined);
    return this.loading;
  }

  /** Fetch + decode only the named clips (idempotent). Lets non-game pages load
   *  just the UI sounds (e.g. the unified click) instead of the full game set. */
  async ensure(names: readonly SoundName[]): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    await Promise.all(
      names.map(async (name) => {
        if (this.buffers.has(name)) return;
        try {
          const res = await fetch(`/sounds/${name}.mp3`);
          if (!res.ok) return;
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* a missing/failed clip just stays silent — never throws */
        }
      }),
    );
  }

  /** Resume the context on a user gesture (autoplay policy); also nudges iOS. */
  unlock(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (!this.unlocked) {
      // A 1-sample silent buffer fully unlocks audio on iOS Safari.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      this.unlocked = true;
    }
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const start = () => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master!);
      src.start(0);
    };
    // The browser can SUSPEND/interrupt the AudioContext after the first hand
    // (notably on mobile). Firing a buffer into a suspended context is silently
    // dropped — which is why sounds died after round 1. So resume first (sticky
    // activation from the initial unlock lets resume() succeed without a fresh
    // gesture), then play once the context is running again.
    if (ctx.state === "running") start();
    else void ctx.resume().then(start).catch(() => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (typeof window !== "undefined") window.localStorage.setItem(LS_MUTED, m ? "1" : "0");
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    this.emit();
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_VOLUME, String(this.volume));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
    this.emit();
  }
}

export const sound = new SoundManager();

/** Reactive view of the mute/volume settings for the UI control. */
export function useSoundSettings() {
  const muted = useSyncExternalStore(
    sound.subscribe,
    () => sound.muted,
    () => false,
  );
  const volume = useSyncExternalStore(
    sound.subscribe,
    () => sound.volume,
    () => DEFAULT_VOLUME,
  );
  return {
    muted,
    volume,
    setMuted: (m: boolean) => sound.setMuted(m),
    setVolume: (v: number) => sound.setVolume(v),
  };
}
