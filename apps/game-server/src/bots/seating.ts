import { QUICK_PLAY } from "@fb/shared";
import type { BotIdentity } from "./identities.js";
import type { RoomPlayer, RoomState } from "../types.js";

/**
 * How many seats the table should reach when filling a cold-start Quick Play room
 * with bots: a randomized size in [botFillMin, botFillMax], never below the
 * current player count and never above the room's max. Randomized so tables
 * aren't always full (harder to spot as bot-filled).
 */
export function fillTarget(currentPlayers: number, maxPlayers: number, rng: () => number): number {
  const lo = QUICK_PLAY.botFillMin;
  const hi = QUICK_PLAY.botFillMax;
  const pick = lo + Math.floor(rng() * (hi - lo + 1)); // inclusive [lo, hi]
  return Math.min(maxPlayers, Math.max(currentPlayers, pick));
}

/**
 * Append bot seats to a LOBBY room from the given identities, taking the lowest
 * free seat numbers. Returns the bot RoomPlayers added (capped by maxPlayers).
 * `available` is left 0 — GameRoom.start() seeds each bot's virtual stack. These
 * seats carry no socket, so the room's private emits (toSeat) naturally skip them.
 */
export function addBotSeats(state: RoomState, identities: readonly BotIdentity[]): RoomPlayer[] {
  const used = new Set(state.players.map((p) => p.seat));
  const added: RoomPlayer[] = [];
  for (const idn of identities) {
    if (state.players.length >= state.maxPlayers) break;
    let seat = 1;
    while (used.has(seat)) seat++;
    used.add(seat);
    const player: RoomPlayer = {
      seat,
      userId: idn.userId,
      username: idn.nickname, // the human-looking display name shown at the seat
      playerNumber: idn.playerNumber,
      status: "WAITING",
      available: 0n,
      committedThisRound: 0n,
      committedTotal: 0n,
      lastBetAmount: 0n,
      hasActed: false,
      forfeit: 0n,
      holeCards: [],
      claimRankId: null,
      claimValid: false,
      claimStrength: 0,
      connected: true,
      isBot: true,
    };
    state.players.push(player);
    added.push(player);
  }
  return added;
}
