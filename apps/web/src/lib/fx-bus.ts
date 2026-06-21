/**
 * Tiny client-only event bus for transient visual effects (chip travel, all-in
 * flash). The socket hook emits onto it after it has already applied the real
 * state; the FX layer listens and animates. It NEVER touches the server — these
 * are fire-and-forget UI cues with zero listeners when animations are off.
 */
export type FxEvent =
  | { type: "bet"; seat: number; amount: number; action: string }
  | { type: "allin"; seat: number };

type Handler = (e: FxEvent) => void;
const handlers = new Set<Handler>();

export const fxBus = {
  emit(e: FxEvent): void {
    handlers.forEach((h) => h(e));
  },
  on(h: Handler): () => void {
    handlers.add(h);
    return () => handlers.delete(h);
  },
};
