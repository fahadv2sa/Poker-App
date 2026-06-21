import { QUICK_PLAY, SERVER_EVENTS, type Difficulty } from "@fp/shared";
import type { Server } from "socket.io";

/**
 * Quick Play matchmaking — server-authoritative, in-memory (the game-server is
 * single-instance, replicas=1). One FIFO queue per difficulty tier; a table
 * auto-starts once `minPlayers` are queued and the fill window elapses, or
 * instantly at `maxSeats`. Lives entirely off the betting hot path: just timers
 * + a single Game insert at match time, reusing the normal table lifecycle.
 *
 * Nothing is charged while queued — leaving the queue costs nothing. The first
 * wallet movement is the ante at the auto-created table's first deal.
 */

const TIERS: readonly Difficulty[] = ["EASY", "MEDIUM", "ELITE"];
const queueRoom = (t: Difficulty) => `queue:${t}`;

interface Entry {
  socketId: string;
  userId: string;
  username: string;
  playerNumber: number;
}

export interface MatchmakingDeps {
  io: Server;
  /** Create a Quick Play Game row (isPrivate, tier ante, AUTO) → its id + code. */
  createQuickGame(tier: Difficulty, hostUserId: string): Promise<{ gameId: string; inviteCode: string }>;
  /** Deal the first hand once the matched players have joined the table. */
  startTable(gameId: string): Promise<void>;
  /**
   * OPTIONAL (bots, cold-start). When set, a tier with ≥1 human but fewer than
   * `minPlayers` arms a SHORT fill window of this many seconds; on expiry the
   * match starts and the empty seats are bot-filled at the table (startTable).
   * Undefined ⇒ today's behavior exactly (a lone human waits for real humans).
   */
  botFillWindowSec?: number;
}

export class Matchmaking {
  private readonly queues = new Map<Difficulty, Entry[]>();
  private readonly timers = new Map<Difficulty, ReturnType<typeof setTimeout>>();
  private readonly deadlines = new Map<Difficulty, number>();
  /** Cold-start bot-fill window (seconds), or null when bots are disabled. */
  private readonly botFillWindowSec: number | null;

  constructor(private readonly deps: MatchmakingDeps) {
    this.botFillWindowSec = deps.botFillWindowSec ?? null;
    for (const t of TIERS) this.queues.set(t, []);
  }

  /** Join a tier queue (leaving any other queue first — one queue per player). */
  join(
    socketId: string,
    user: { userId: string; username: string; playerNumber: number },
    tier: Difficulty,
  ): void {
    this.detach(socketId, null); // ensure single membership, no rebalance yet
    const q = this.queues.get(tier)!;
    if (!q.some((e) => e.userId === user.userId)) q.push({ socketId, ...user });
    this.deps.io.sockets.sockets.get(socketId)?.join(queueRoom(tier));
    this.evaluate(tier);
    this.broadcast(tier);
  }

  /** Leave the queue (explicit leave or disconnect). Clean, no leftover state. */
  leave(socketId: string): void {
    this.detach(socketId, "rebalance");
  }

  private detach(socketId: string, mode: "rebalance" | null): void {
    for (const t of TIERS) {
      const q = this.queues.get(t)!;
      const i = q.findIndex((e) => e.socketId === socketId);
      if (i >= 0) {
        q.splice(i, 1);
        this.deps.io.sockets.sockets.get(socketId)?.leave(queueRoom(t));
        if (mode === "rebalance") {
          this.evaluate(t);
          this.broadcast(t);
        }
        return;
      }
    }
  }

  /** Arm/cancel the fill window; start instantly when full. */
  private evaluate(tier: Difficulty): void {
    const q = this.queues.get(tier)!;
    if (q.length >= QUICK_PLAY.maxSeats) {
      void this.startMatch(tier);
      return;
    }
    if (q.length >= QUICK_PLAY.minPlayers) {
      this.arm(tier, QUICK_PLAY.fillWindowSec); // enough humans → standard window
      return;
    }
    // Cold start: bots enabled and at least one human waiting → short fill window.
    if (this.botFillWindowSec != null && q.length >= 1) {
      this.arm(tier, this.botFillWindowSec);
      return;
    }
    this.clearTimer(tier); // 0 players (or bots disabled below min) → stop the countdown
  }

  /** Arm the per-tier fill timer (keeps the earliest deadline if already armed). */
  private arm(tier: Difficulty, seconds: number): void {
    if (this.timers.has(tier)) return;
    const ms = seconds * 1000;
    this.deadlines.set(tier, Date.now() + ms);
    this.timers.set(
      tier,
      setTimeout(() => {
        this.timers.delete(tier);
        this.deadlines.delete(tier);
        void this.startMatch(tier);
      }, ms),
    );
  }

  private clearTimer(tier: Difficulty): void {
    const t = this.timers.get(tier);
    if (t) clearTimeout(t);
    this.timers.delete(tier);
    this.deadlines.delete(tier);
  }

  private broadcast(tier: Difficulty): void {
    const q = this.queues.get(tier)!;
    this.deps.io.to(queueRoom(tier)).emit(SERVER_EVENTS.queueState, {
      difficulty: tier,
      count: q.length,
      min: QUICK_PLAY.minPlayers,
      max: QUICK_PLAY.maxSeats,
      deadlineTs: this.deadlines.get(tier) ?? null,
    });
  }

  private async startMatch(tier: Difficulty): Promise<void> {
    this.clearTimer(tier);
    const q = this.queues.get(tier)!;
    // Start if either we have enough humans for a real table, OR bots are enabled
    // and at least one human is waiting (the rest of the table is bot-filled at
    // startTable). Otherwise keep waiting.
    const humanOnly = q.length >= QUICK_PLAY.minPlayers;
    const botFill = this.botFillWindowSec != null && q.length >= 1;
    if (!humanOnly && !botFill) {
      this.broadcast(tier);
      return;
    }
    const group = q.splice(0, QUICK_PLAY.maxSeats); // FIFO, up to a full table
    try {
      const { gameId, inviteCode } = await this.deps.createQuickGame(tier, group[0]!.userId);
      for (const e of group) {
        const sock = this.deps.io.sockets.sockets.get(e.socketId);
        sock?.leave(queueRoom(tier));
        sock?.emit(SERVER_EVENTS.queueMatched, { gameId, inviteCode });
      }
      // Give clients a moment to navigate to the table + join, then deal.
      setTimeout(() => void this.deps.startTable(gameId), QUICK_PLAY.startGraceSec * 1000);
    } catch (err) {
      console.error("[matchmaking] failed to create quick game", err);
      q.unshift(...group); // put them back; the next trigger retries
    }
    this.evaluate(tier); // any remaining (7th+) may form the next table
    this.broadcast(tier);
  }
}
