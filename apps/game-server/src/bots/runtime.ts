import { QUICK_PLAY } from "@fb/shared";
import { BotController, type BotControllerOptions } from "./controller.js";
import type { BotIdentity } from "./identities.js";
import { BotIdentityPool } from "./pool.js";
import { addBotSeats, fillTarget } from "./seating.js";
import type { RoomState } from "../types.js";

/**
 * The cohesive bot facade the server wiring touches (Phase 4). Bundles the
 * identity pool + the turn-driving controller and exposes just `fill` and
 * `release`, so socket.ts has a handful of guarded call sites. Constructed only
 * when BOTS_ENABLED is on; deleting `src/bots/` and these call sites removes the
 * feature entirely.
 */
export class BotRuntime {
  /** Injected into RoomDeps.bots so the room can drive bot turns. */
  readonly controller: BotController;
  private readonly pool: BotIdentityPool;
  private readonly rng: () => number;

  constructor(
    identities: readonly BotIdentity[],
    opts: { controller?: BotControllerOptions; rng?: () => number } = {},
  ) {
    this.pool = new BotIdentityPool(identities);
    this.controller = new BotController(opts.controller);
    this.rng = opts.rng ?? Math.random;
  }

  get availableIdentities(): number {
    return this.pool.available;
  }

  /** Return one bot identity to the pool — used when a human takes a bot's seat
   *  (Quick Play "join after the current round"). */
  releaseOne(playerNumber: number): void {
    this.pool.releaseOne(playerNumber);
  }

  /**
   * Cold-start fill: seat bots into a LOBBY Quick Play room to reach a randomized
   * target, but ONLY when the human count is below minPlayers (true cold start).
   * Returns the number of bots seated (0 if not applicable or the pool is empty).
   * Call AFTER the human grace, just before GameRoom.start().
   */
  fill(state: RoomState): number {
    const connected = state.players.filter((p) => p.connected);
    const humans = connected.filter((p) => !p.isBot);
    // Only fill genuine cold-start tables: at least one human, but fewer than
    // minPlayers. A healthy all-human table (>= minPlayers) gets no bots.
    if (humans.length < 1 || humans.length >= QUICK_PLAY.minPlayers) return 0;
    const target = fillTarget(connected.length, state.maxPlayers, this.rng);
    const need = target - connected.length;
    if (need <= 0) return 0;
    const identities = this.pool.acquire(need, this.rng);
    if (identities.length === 0) return 0;
    return addBotSeats(state, identities).length;
  }

  /**
   * Release a room's bot identities back to the pool and cancel any pending bot
   * actions. Call on room teardown (host close / auto-empty).
   */
  release(state: RoomState): void {
    const bots = state.players.filter((p) => p.isBot);
    this.pool.release(bots.map((p) => ({ playerNumber: p.playerNumber })));
    this.controller.cancel(state.gameId);
  }
}
