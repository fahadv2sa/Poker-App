"use client";

import { sound, useUiSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/**
 * Mutes the app-wide UI tap sounds (OUTSIDE the game table only). It toggles the
 * independent `uiMuted` flag — the live game table has its own audio system and
 * its own mute (SoundControl), neither of which is affected by this button.
 * Sits next to the ⋯ menu in the home top bar; styled to match (.kebab-btn).
 */
export function UiSoundToggle({ className }: { className?: string }) {
  const { uiMuted, setUiMuted } = useUiSound();
  return (
    <button
      type="button"
      aria-label={uiMuted ? "تشغيل أصوات الواجهة" : "كتم أصوات الواجهة"}
      aria-pressed={uiMuted}
      // Opt out of the global tap sound on this control itself — toggling its own
      // sound shouldn't click.
      data-sound="none"
      onClick={() => {
        sound.unlock();
        const next = !uiMuted;
        setUiMuted(next);
        if (!next) sound.playUi("tap"); // small confirmation when re-enabling
      }}
      className={cn(
        "kebab-btn grid size-11 shrink-0 place-items-center rounded-2xl text-foreground/85 hover:text-foreground",
        className,
      )}
    >
      {uiMuted ? <IconMuted /> : <IconSound />}
    </button>
  );
}

function IconSound() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function IconMuted() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
