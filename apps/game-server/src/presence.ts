import type { RoomPlayer } from "./types.js";

/**
 * True iff at least one real HUMAN player is still connected.
 *
 * Quick Play bots are seated with `connected: true` (they have no socket), but a
 * bot must NOT keep an abandoned table alive. So the room keep-alive / teardown
 * decision counts humans ONLY: once the last human leaves, the table is torn down
 * even though bots remain "connected". For human-only rooms this is identical to
 * `some(p => p.connected)`, so manual rooms are unaffected.
 */
export function hasConnectedHuman(
  players: readonly Pick<RoomPlayer, "connected" | "isBot">[],
): boolean {
  return players.some((p) => p.connected && !p.isBot);
}
