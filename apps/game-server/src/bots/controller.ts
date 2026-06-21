import type { Action } from "@fp/engine";
import type { BotPort, GameRoom } from "../room.js";
import { decide, handStrength, personalityForSeed, potOdds } from "./strategy.js";

/**
 * Bot turn-driver (Phase 3). Implements the optional `BotPort` seam: when a bot
 * seat's turn opens, it builds the decision context from the room's public
 * `botTurnView`, asks the pure `decide()` engine for an action + a human-like
 * delay, then schedules `room.placeAction` after that delay. Personality is
 * derived deterministically from the bot's stable `playerNumber`.
 *
 * Everything here is gated behind injection: the room only calls `onTurn` when a
 * seat `isBot` AND a controller was wired into `RoomDeps.bots`. Nothing wires it
 * yet (that is Phase 4) — this module is currently unreferenced by the live game.
 *
 * Determinism for tests comes from injectable `schedule`/`now`/`rng`; in
 * production they default to setTimeout / Date.now / Math.random.
 */

/** Schedule `cb` after `ms`; returns a cancel handle. */
export type BotSchedule = (ms: number, cb: () => void | Promise<void>) => () => void;

const DEFAULT_SCHEDULE: BotSchedule = (ms, cb) => {
  const h = setTimeout(() => void cb(), ms);
  return () => clearTimeout(h);
};

/** Act at least this far before the server's turn deadline, so a bot never lets
 *  its turn time out (which would auto-fold/check it via onTurnTimeout). */
const SAFETY_MS = 1500;

export interface BotControllerOptions {
  schedule?: BotSchedule;
  now?: () => number;
  rng?: () => number;
}

export class BotController implements BotPort {
  private readonly schedule: BotSchedule;
  private readonly now: () => number;
  private readonly rng: () => number;
  /** key `${gameId}:${seat}` → cancel handle for that seat's pending action. */
  private readonly pending = new Map<string, () => void>();

  constructor(opts: BotControllerOptions = {}) {
    this.schedule = opts.schedule ?? DEFAULT_SCHEDULE;
    this.now = opts.now ?? (() => Date.now());
    this.rng = opts.rng ?? Math.random;
  }

  onTurn(room: GameRoom, seat: number, deadlineTs: number): void {
    const player = room.state.players.find((p) => p.seat === seat);
    if (!player?.isBot) return; // defensive — the room only calls this for bots
    const view = room.botTurnView(seat);
    if (!view) return; // not actually this seat's turn anymore

    const decision = decide({
      legal: view.legal,
      strength: handStrength(view.pool, view.ranks),
      street: view.street,
      potOdds: potOdds(view.legal.callAmount, view.pot),
      pot: view.pot,
      personality: personalityForSeed(player.playerNumber),
      rng: this.rng,
    });

    const key = `${room.state.gameId}:${seat}`;
    this.clearKey(key);
    // Never overshoot the server deadline: act within [0, deadline − safety].
    const maxWait = Math.max(0, deadlineTs - this.now() - SAFETY_MS);
    const wait = Math.min(decision.delayMs, maxWait);
    const cancel = this.schedule(wait, async () => {
      this.pending.delete(key);
      await this.apply(room, seat, decision.action);
    });
    this.pending.set(key, cancel);
  }

  /** Cancel any scheduled bot actions for a room (call on hand/room teardown). */
  cancel(gameId: string): void {
    for (const [key, cancelFn] of [...this.pending]) {
      if (key.startsWith(`${gameId}:`)) {
        cancelFn();
        this.pending.delete(key);
      }
    }
  }

  private async apply(room: GameRoom, seat: number, action: Action): Promise<void> {
    // The turn may have moved on while the bot "thought" (a human folded, the
    // hand ended, the room closed) — re-check against authoritative state.
    if (room.isClosed) return;
    if (room.state.currentTurnSeat !== seat) return;
    try {
      await room.placeAction(seat, action);
    } catch {
      // Raced into illegality; the server's 60s turn timeout covers the seat.
    }
  }

  private clearKey(key: string): void {
    const c = this.pending.get(key);
    if (c) {
      c();
      this.pending.delete(key);
    }
  }
}
