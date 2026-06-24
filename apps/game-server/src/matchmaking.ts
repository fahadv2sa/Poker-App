import { QUICK_PLAY, SERVER_EVENTS, type Difficulty } from "@fb/shared";
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
  /**
   * Cosmetic "table filling" ramp for the cold-start waiting lobby: while the
   * bot-fill window counts down, the broadcast `count` rises (humans + a growing
   * number of soon-to-be-seated players) so the lobby's seats visibly fill rather
   * than showing the player alone. PRESENTATIONAL ONLY — the real queue and the
   * matching/seating logic are untouched; bots are shown indistinguishably (just a
   * count + seat dots, no labels), consistent with the bot-illusion design.
   */
  private readonly fillSim = new Map<
    Difficulty,
    { bots: number; target: number; timer: ReturnType<typeof setInterval> }
  >();

  constructor(private readonly deps: MatchmakingDeps) {
    this.botFillWindowSec = deps.botFillWindowSec ?? null;
    for (const t of TIERS) this.queues.set(t, []);
  }

  /** Begin trickling simulated players into the lobby count over the fill window. */
  private startFillSim(tier: Difficulty): void {
    if (this.botFillWindowSec == null || this.fillSim.has(tier)) return;
    const { botFillMin, botFillMax } = QUICK_PLAY;
    // How many extra players to "gather" (alongside the waiting human(s)).
    const target = botFillMin - 1 + Math.floor(Math.random() * (botFillMax - botFillMin + 1));
    if (target <= 0) return;
    const stepMs = Math.max(900, Math.floor((this.botFillWindowSec * 1000) / (target + 1)));
    const timer = setInterval(() => {
      const sim = this.fillSim.get(tier);
      if (!sim) return;
      if (sim.bots >= sim.target) {
        clearInterval(sim.timer);
        return;
      }
      sim.bots += 1;
      this.broadcast(tier); // one more "player" appeared → seats fill
    }, stepMs);
    this.fillSim.set(tier, { bots: 0, target, timer });
  }

  private stopFillSim(tier: Difficulty): void {
    const sim = this.fillSim.get(tier);
    if (sim) {
      clearInterval(sim.timer);
      this.fillSim.delete(tier);
    }
  }

  private simBots(tier: Difficulty): number {
    return this.fillSim.get(tier)?.bots ?? 0;
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
        if (q.length === 0) this.stopFillSim(t); // vacated tier → stop its ramp
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
      this.stopFillSim(tier);
      void this.startMatch(tier);
      return;
    }
    if (q.length >= QUICK_PLAY.minPlayers) {
      this.stopFillSim(tier); // a real all-human table — no simulated fill
      this.arm(tier, QUICK_PLAY.fillWindowSec);
      return;
    }
    // Cold start: bots enabled and at least one human waiting → short fill window,
    // and ramp the lobby count so the table visibly fills up.
    if (this.botFillWindowSec != null && q.length >= 1) {
      this.arm(tier, this.botFillWindowSec);
      this.startFillSim(tier);
      return;
    }
    this.stopFillSim(tier);
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
    // Real humans + the cold-start "filling" ramp (0 unless a bot-fill window is
    // active), capped at the table size. Presentational only.
    const count = Math.min(QUICK_PLAY.maxSeats, q.length + this.simBots(tier));
    this.deps.io.to(queueRoom(tier)).emit(SERVER_EVENTS.queueState, {
      difficulty: tier,
      count,
      min: QUICK_PLAY.minPlayers,
      max: QUICK_PLAY.maxSeats,
      deadlineTs: this.deadlines.get(tier) ?? null,
    });
  }

  private async startMatch(tier: Difficulty): Promise<void> {
    this.clearTimer(tier);
    this.stopFillSim(tier); // the table is forming; clients navigate to it now
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
