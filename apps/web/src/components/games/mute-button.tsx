"use client";

import { sound, useUiSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { SoundOffIcon, SoundOnIcon } from "./lu-icons";

/** Shared gold UI-sound mute toggle (reuses the app's real useUiSound state). */
export function MuteButton({ className, size = 18 }: { className?: string; size?: number }) {
  const { uiMuted, setUiMuted } = useUiSound();
  return (
    <button
      type="button"
      aria-label={uiMuted ? "تشغيل أصوات الواجهة" : "كتم أصوات الواجهة"}
      aria-pressed={uiMuted}
      data-sound="none"
      onClick={() => {
        sound.unlock();
        const next = !uiMuted;
        setUiMuted(next);
        if (!next) sound.playUi("click");
      }}
      className={cn("lu-btn lu-frame grid size-10 place-items-center rounded-xl", className)}
    >
      {uiMuted ? <SoundOffIcon size={size} /> : <SoundOnIcon size={size} />}
    </button>
  );
}
