/**
 * ───────────────────────────────────────────────────────────────────────────
 * LIVE-PLAY ANIMATION TOGGLE  ←  the single place to turn the effects on/off
 * ───────────────────────────────────────────────────────────────────────────
 *
 * MASTER SWITCH: set ANIMATIONS_ENABLED = false to disable EVERY live-play
 * animation in one move. With it off, the table renders and plays exactly as it
 * did before this layer existed — animations are simply absent, nothing depends
 * on them.
 *
 * PER-ANIMATION: flip any flag in ANIMATION_FLAGS to disable just that one.
 * (The master switch overrides all of them.)
 *
 * These are visual-only: every effect reads existing client view state and emits
 * nothing back to the server. Reduced-motion users get a calm experience via the
 * global prefers-reduced-motion CSS guard + framer's MotionConfig.
 */
export const ANIMATIONS_ENABLED = true;

export type AnimKey =
  | "turnRing" // #1 depleting timer ring around the active avatar
  | "cardFlip" // #2 community-card flip reveal
  | "chipTravel" // #3 chip flies from the actor to the pot
  | "potCountUp" // #4 pot number tweens up + ripple
  | "dealFromDeck" // #5 cards deal in from a deck origin
  | "coinPayout" // #6 coins fly from the pot to the winner
  | "foldMuck" // #7 folded seat fades / "انسحب" stamp
  | "dealerButton" // #8 dealer "D" badge glides between seats
  | "actionBar" // #9 action bar entrance + tap feedback
  | "streetFlourish" // #10 street name flourish on phase change
  | "winnerReveal" // #11 trophy bounce + winner shimmer
  | "allInBeat"; // #12 all-in gold screen flash

export const ANIMATION_FLAGS: Record<AnimKey, boolean> = {
  turnRing: true,
  cardFlip: true,
  chipTravel: true,
  potCountUp: true,
  dealFromDeck: true,
  coinPayout: true,
  foldMuck: true,
  dealerButton: true,
  actionBar: true,
  streetFlourish: true,
  winnerReveal: true,
  allInBeat: true,
};

/** True iff animations are globally on AND this specific effect is enabled. */
export function anim(key: AnimKey): boolean {
  return ANIMATIONS_ENABLED && ANIMATION_FLAGS[key];
}
