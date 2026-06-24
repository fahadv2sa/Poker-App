import type { Settlement } from "@fb/engine";
import { HAND_RANK_CATALOG, DEFAULT_GAME_CONFIG } from "@fb/shared";
import { describe, expect, it } from "vitest";
import { dealFromDeck } from "../src/cards.js";
import { BotController, type BotSchedule } from "../src/bots/controller.js";
import { personalityForSeed } from "../src/bots/strategy.js";
import { GameRoom, type RoomDeps } from "../src/room.js";
import type {
  BetRecord,
  CardSource,
  Clock,
  Emitter,
  LedgerMovement,
  PlayEventRecord,
  RoomPersistence,
} from "../src/ports.js";
import type { DealtCard, RankInfo, RoomPlayer, RoomState } from "../src/types.js";

/**
 * Phase 3 — the BotController + the room's `deps.bots?.onTurn` seam, exercised
 * against a real GameRoom with in-memory fakes. A deterministic manual scheduler
 * replaces setTimeout so the human-like delays are driven explicitly. The
 * controller is injected as `deps.bots` here (test-only; production wiring is
 * Phase 4) — with it absent the room behaves exactly as before.
 */

// --- a deterministic scheduler (captures jobs instead of using real timers) ---

class ManualScheduler {
  jobs: Array<{ ms: number; cb: () => void | Promise<void> }> = [];
  readonly schedule: BotSchedule = (ms, cb) => {
    const job = { ms, cb };
    this.jobs.push(job);
    return () => {
      this.jobs = this.jobs.filter((j) => j !== job);
    };
  };
  /** Drain jobs (including any scheduled while draining) until idle. */
  async runUntilIdle(max = 300): Promise<void> {
    let n = 0;
    while (this.jobs.length) {
      if (n++ > max) throw new Error("scheduler did not drain");
      const job = this.jobs.shift()!;
      await job.cb();
    }
  }
}

// --- fakes (same shape as the room-flow tests) -----------------------------

class FakeCards implements CardSource {
  constructor(private readonly deck: DealtCard[]) {}
  async dealHand(_t: string, seatCount: number, holePerSeat: number) {
    return dealFromDeck(this.deck, seatCount, holePerSeat);
  }
  releaseTable() {}
}

class FakePersistence implements RoomPersistence {
  movements: LedgerMovement[] = [];
  bets: BetRecord[] = [];
  settlements: Settlement[] = [];
  resolveCalls = 0;
  playEvents: PlayEventRecord[] = [];
  aggregated: string[] = [];
  constructor(private readonly balances: Record<string, bigint> = {}) {}
  async getBalances(ids: string[]) {
    return new Map(ids.map((id) => [id, this.balances[id] ?? 1000n]));
  }
  async persistDeal() {}
  async applyBetting(_g: string, m: LedgerMovement[], b: BetRecord[]) {
    this.movements.push(...m);
    this.bets.push(...b);
  }
  async persistClaim() {}
  async persistResolve(_g: string, s: Settlement[]) {
    this.resolveCalls += 1;
    this.settlements.push(...s);
  }
  async closeGame() {}
  async recordPlayEvents(e: PlayEventRecord[]) {
    this.playEvents.push(...e);
  }
  async aggregatePlayers(ids: string[]) {
    this.aggregated.push(...ids);
  }
}

class FakeEmitter implements Emitter {
  room: Array<{ event: string; payload: any }> = [];
  seat: Array<{ seat: number; event: string; payload: any }> = [];
  toRoom(event: string, payload: unknown) {
    this.room.push({ event, payload });
  }
  toSeat(seat: number, event: string, payload: unknown) {
    this.seat.push({ seat, event, payload });
  }
}

class ManualTimers {
  pending = new Map<string, () => void>();
  arm(key: string, _ms: number, cb: () => void) {
    this.pending.set(key, cb);
  }
  clear(key: string) {
    this.pending.delete(key);
  }
  clearAll() {
    this.pending.clear();
  }
}

const clock: Clock = { now: () => 0 };

const RANKS: RankInfo[] = HAND_RANK_CATALOG.map((r) => ({
  id: r.code,
  code: r.code,
  strength: r.strength,
  rule: r.rule,
  nameAr: r.nameAr,
}));

const card = (id: string, position: string, nationality: string): DealtCard => ({
  playerId: id,
  name: id,
  nameAr: `${id}-ع`,
  nationality,
  position,
  clubs: [],
  photoUrl: null,
});

/** All-midfielder deck (9 cards) ⇒ every 7-card pool is ROYAL_POSITION. */
const allMid = () => Array.from({ length: 9 }, (_, i) => card(`p${i}`, "MID", `N${i}`));

function botPlayer(seat: number, userId: string): RoomPlayer {
  return {
    seat,
    userId,
    username: userId,
    playerNumber: 900000 + seat,
    status: "WAITING",
    available: 1000n,
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
}
function humanPlayer(seat: number, userId: string): RoomPlayer {
  return { ...botPlayer(seat, userId), playerNumber: 100000 + seat, isBot: false };
}

function makeRoom(players: RoomPlayer[], deck: DealtCard[]) {
  const scheduler = new ManualScheduler();
  // Seeded RNG so decisions are reproducible.
  let s = 99;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const controller = new BotController({ schedule: scheduler.schedule, now: () => 0, rng });

  const state: RoomState = {
    gameId: "g1",
    roomName: "QP",
    inviteCode: "INV1",
    createdBy: players[0]!.userId,
    hostUserId: players[0]!.userId,
    maxPlayers: 6,
    isPrivate: true,
    config: { ...DEFAULT_GAME_CONFIG, resolveMode: "AUTO" },
    status: "LOBBY",
    phase: "LOBBY",
    players,
    community: [],
    communityRevealed: 0,
    handNumber: 0,
    dealerSeat: null,
    currentTurnSeat: null,
    currentBet: 0n,
    turnDeadlineTs: null,
    ranks: RANKS,
  };
  const persistence = new FakePersistence();
  const emitter = new FakeEmitter();
  const deps: RoomDeps = {
    cards: new FakeCards(deck),
    persistence,
    emitter,
    timers: new ManualTimers() as RoomDeps["timers"],
    clock,
    bots: controller,
  };
  return { room: new GameRoom(state, deps), persistence, emitter, scheduler, controller };
}

const betsOf = (e: FakeEmitter, seat: number) =>
  e.room.filter((x) => x.event === "bet:placed" && x.payload.seat === seat);

// --- tests -----------------------------------------------------------------

describe("BotController — the seam auto-drives a bot's turn", () => {
  it("schedules the bot's action when its turn opens and applies it on the timer", async () => {
    // seat 1 human (dealer), seat 2 bot ⇒ the bot acts first.
    const { room, scheduler, emitter } = makeRoom(
      [humanPlayer(1, "u1"), botPlayer(2, "bot2")],
      allMid(),
    );

    await room.start();
    // The seam fired during start(): exactly one bot action is scheduled, not run.
    expect(room.state.currentTurnSeat).toBe(2);
    expect(scheduler.jobs).toHaveLength(1);
    expect(betsOf(emitter, 2)).toHaveLength(0);

    await scheduler.runUntilIdle();
    // The bot acted (a bet:placed for seat 2) and the turn moved to the human.
    expect(betsOf(emitter, 2).length).toBeGreaterThan(0);
    expect(room.state.currentTurnSeat).toBe(1);
  });

  it("plays a full human-vs-bot hand to resolution with the bot acting on its own", async () => {
    const { room, persistence, emitter, scheduler } = makeRoom(
      [humanPlayer(1, "u1"), botPlayer(2, "bot2")],
      allMid(),
    );
    await room.start();

    // Drive: bot turns run via the scheduler; human turns are answered here.
    let guard = 0;
    while (room.state.phase !== "ENDED" && !room.isClosed) {
      if (guard++ > 200) throw new Error("hand did not finish");
      const turn = room.state.currentTurnSeat;
      if (turn == null) {
        if (scheduler.jobs.length) await scheduler.runUntilIdle();
        else break;
        continue;
      }
      const p = room.state.players.find((x) => x.seat === turn)!;
      if (p.isBot) {
        await scheduler.runUntilIdle();
      } else {
        const owed = room.state.currentBet - p.committedThisRound;
        const action =
          owed <= 0n
            ? { type: "CHECK" as const }
            : p.available >= owed
              ? { type: "CALL" as const }
              : { type: "ALLIN" as const };
        await room.placeAction(turn, action);
      }
    }

    expect(room.state.phase).toBe("ENDED");
    expect(persistence.resolveCalls).toBe(1);
    // The bot genuinely participated …
    expect(betsOf(emitter, 2).length).toBeGreaterThan(0);
    // … and isolation still holds end-to-end: no bot ever hit the ledger or stats.
    expect(persistence.movements.every((m) => !m.userId.startsWith("bot"))).toBe(true);
    expect(persistence.playEvents.every((e) => !e.playerId.startsWith("bot"))).toBe(true);
    expect(persistence.aggregated.every((id) => !id.startsWith("bot"))).toBe(true);
  });
});

describe("BotController — safety + lifecycle", () => {
  it("does nothing for a non-bot seat", () => {
    const { room, controller, scheduler } = makeRoom(
      [humanPlayer(1, "u1"), botPlayer(2, "bot2")],
      allMid(),
    );
    controller.onTurn(room, 1, 60_000); // seat 1 is a human
    expect(scheduler.jobs).toHaveLength(0);
  });

  it("aborts the scheduled action if the turn moved on before it fires", async () => {
    const { room, emitter, scheduler } = makeRoom(
      [humanPlayer(1, "u1"), botPlayer(2, "bot2")],
      allMid(),
    );
    await room.start(); // bot (seat 2) to act → one job scheduled
    expect(scheduler.jobs).toHaveLength(1);

    // Simulate the turn having advanced (e.g. a human folded) before the bot fires.
    room.state.currentTurnSeat = 1;
    await scheduler.runUntilIdle();

    // The stale job applied nothing — no bet:placed for the bot.
    expect(betsOf(emitter, 2)).toHaveLength(0);
  });

  it("clamps the scheduled delay to before the server deadline", async () => {
    const { room, controller, scheduler } = makeRoom(
      [humanPlayer(1, "u1"), botPlayer(2, "bot2")],
      allMid(),
    );
    await room.start(); // bot at seat 2 to act; clears any prior schedule on re-call

    // A deadline only 1s out, with now()=0 and a 1.5s safety margin ⇒ wait 0.
    controller.onTurn(room, 2, 1_000);
    expect(scheduler.jobs).toHaveLength(1);
    expect(scheduler.jobs[0]!.ms).toBe(0);
  });

  it("cancel(gameId) drops a room's pending bot actions", async () => {
    const { room, controller, scheduler } = makeRoom(
      [humanPlayer(1, "u1"), botPlayer(2, "bot2")],
      allMid(),
    );
    await room.start();
    expect(scheduler.jobs).toHaveLength(1);
    controller.cancel("g1");
    expect(scheduler.jobs).toHaveLength(0);
  });
});

describe("personalityForSeed — stable, varied identities", () => {
  it("is deterministic for the same id", () => {
    expect(personalityForSeed(900042)).toEqual(personalityForSeed(900042));
  });

  it("differs across ids and covers all four archetypes over a range", () => {
    const seen = new Set<string>();
    let distinctParams = 0;
    const first = personalityForSeed(900001);
    for (let i = 1; i <= 200; i++) {
      const p = personalityForSeed(900000 + i);
      seen.add(p.archetype);
      if (JSON.stringify(p) !== JSON.stringify(first)) distinctParams++;
    }
    expect(seen).toEqual(new Set(["conservative", "aggressive", "tricky", "balanced"]));
    expect(distinctParams).toBeGreaterThan(190); // virtually all are unique
  });
});
