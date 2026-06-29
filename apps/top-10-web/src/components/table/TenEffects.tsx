"use client";

import { useEffect, useRef, useState } from "react";
import { CONFETTI, useFly } from "@fb/table-ui";
import type { TtRevealEvent } from "@fb/shared";
import { ttSound } from "@/lib/sound";
import { TT_ANIMATIONS_ENABLED } from "@/lib/anim";

/**
 * Celebration + sound layer (must be a child of FlyProvider). Watches the reveal stream
 * and key state transitions and fires: a reveal ding (rank-10 → fanfare + confetti + a
 * star shower), a star-fly to your account when YOU reveal a card, plus turn/hint/lock
 * cues. Decorative; FX honor TT_ANIMATIONS_ENABLED + reduced-motion (via FlyProvider /
 * the confetti CSS), sound honors the mute toggle.
 */
export function TenEffects({
  reveal,
  mySeat,
  isMyTurn,
  hintMode,
  locked,
}: {
  reveal: { event: TtRevealEvent; id: number } | null;
  mySeat: number | undefined;
  isMyTurn: boolean;
  hintMode: boolean;
  locked: boolean;
}) {
  const { fly } = useFly();
  const [confetti, setConfetti] = useState(0);
  const lastReveal = useRef(0);
  const prevTurn = useRef(isMyTurn);
  const prevHint = useRef(hintMode);
  const prevLock = useRef(locked);

  // reveal → sound + star fly (+ confetti/fanfare for the rank-10 jackpot)
  useEffect(() => {
    if (!reveal || reveal.id === lastReveal.current) return;
    lastReveal.current = reveal.id;
    const { rank, bySeat } = reveal.event;
    const jackpot = rank === 10;
    ttSound.play(jackpot ? "jackpot" : "reveal");
    if (jackpot) setConfetti((n) => n + 1);

    const mine = mySeat != null && bySeat === mySeat;
    // anchor must be mounted (card just flipped) → fire on the next tick
    const t = setTimeout(() => {
      if (mine) fly({ from: `[data-fx="ten-card-${rank}"]`, to: `[data-fx="ten-mine"]`, kind: "star", count: rank >= 8 ? 7 : 4 });
      else if (jackpot) fly({ from: `[data-fx="ten-card-${rank}"]`, to: `[data-fx="ten-card-${rank}"]`, kind: "star", count: 8 });
    }, 130);
    return () => clearTimeout(t);
  }, [reveal, mySeat, fly]);

  // turn / hint / lock transitions → cues
  useEffect(() => {
    if (isMyTurn && !prevTurn.current) ttSound.play("turn");
    prevTurn.current = isMyTurn;
  }, [isMyTurn]);
  useEffect(() => {
    if (hintMode && !prevHint.current) ttSound.play("hint");
    prevHint.current = hintMode;
  }, [hintMode]);
  useEffect(() => {
    if (locked && !prevLock.current) ttSound.play("lock");
    prevLock.current = locked;
  }, [locked]);

  // clear the confetti burst after it falls
  useEffect(() => {
    if (confetti === 0) return;
    const t = setTimeout(() => setConfetti(0), 3200);
    return () => clearTimeout(t);
  }, [confetti]);

  if (!TT_ANIMATIONS_ENABLED || confetti === 0) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {CONFETTI.map((c, i) => (
        <span
          key={`${confetti}-${i}`}
          className="confetti-pc"
          style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}
        />
      ))}
    </div>
  );
}
