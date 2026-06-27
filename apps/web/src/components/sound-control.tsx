"use client";

import { useState } from "react";
import { sound, useSoundSettings } from "@/lib/sound";
import { cn } from "@/lib/utils";

/**
 * Mute/unmute toggle + volume slider for the game sounds. Lives in the table
 * header. State persists in localStorage via the sound manager. Clicking also
 * counts as a user gesture, so it doubles as an audio unlock.
 */
export function SoundControl({ className }: { className?: string }) {
  const { muted, volume, setMuted, setVolume } = useSoundSettings();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative flex items-center", className)}>
      <button
        type="button"
        aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
        aria-pressed={muted}
        onClick={() => {
          sound.unlock();
          const next = !muted;
          setMuted(next);
          if (!next) sound.play("click");
        }}
        onMouseEnter={() => setOpen(true)}
        className="grid size-8 place-items-center rounded-full border border-[var(--lu-gold-1)]/25 bg-[#0b0908]/70 text-[var(--lu-cream)]/80 transition hover:border-[var(--lu-gold-1)]/45 hover:text-[var(--lu-cream)]"
      >
        {muted || volume === 0 ? <IconMuted /> : <IconSound />}
      </button>

      {/* Volume slider — appears on hover/focus of the cluster. */}
      <div
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={cn(
          "overflow-hidden transition-all",
          open ? "ms-2 w-24 opacity-100" : "w-0 opacity-0",
        )}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="مستوى الصوت"
          onChange={(e) => {
            sound.unlock();
            const v = Number(e.target.value);
            setVolume(v);
            if (muted && v > 0) setMuted(false);
          }}
          className="w-24 cursor-pointer accent-[var(--lu-gold-1)]"
        />
      </div>
    </div>
  );
}

function IconSound() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function IconMuted() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
