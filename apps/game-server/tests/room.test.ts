import type { HandRankDef, Settlement } from "@fp/engine";
import { HAND_RANK_CATALOG, DEFAULT_GAME_CONFIG } from "@fp/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { dealFromDeck } from "../src/cards.js";
import { GameRoom, type RoomDeps } from "../src/room.js";
import type {
  BetRecord,
  CardSource,
  Clock,
  Emitter,
  LedgerMovement,
  RoomPersistence,
  TimerService,
} from "../src/ports.js";
import type { DealtCard, RoomPlayer, RoomState } from "../src/types.js";

/**
 * End-to-end hand flow through GameRoom with in-memory fakes (no DB, no
 * sockets). Exercises the integration of dealing, antes, betting rounds, phase
 * transitions, showdown claims, and settlement — the Section 18 integration
 * concerns that don't require live Postgres.
 */

// --- fakes -----------------------------------------------------------------

class FakeCards implements CardSource {
  constructor(private readonly deck: DealtCard[]) {}
  async dealHand(seatCount: number, holePerSeat: number) {
    return dealFromDeck(this.deck, seatCount, holePerSeat);
  }
}

class FakePersistence implements RoomPersistence {
  movements: LedgerMovement[] = [];
  bets: BetRecord[] = [];
  claims: Array<{ seat: number; valid: boolean }> = [];
  settlements: Settlement[] = [];
  async persistDeal() {}
  async applyBetting(_g: string, m: LedgerMovement[], b: BetRecord[]) {
    this.movements.push(...m);
    this.bets.push(...b);
  }
  async persistClaim(_g: string, p: RoomPlayer, _r: string | null, valid: boolean) {
    this.claims.push({ seat: p.seat, valid });
  }
  async persistResolve(_g: string, s: Settlement[]) {
    this.settlements.push(...s);
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

class ManualTimers implements TimerService {
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

// --- fixtures --------------------------------------------------------------

const RANKS: HandRankDef[] = HAND_RANK_CATALOG.map((r) => ({
  id: r.code,
  code: r.code,
  strength: r.strength,
  rule: r.rule,
}));

const card = (id: string, position: string, nationality = "X"): DealtCard => ({
  playerId: id,
  name: id,
  nationality,
  position,
  clubs: [],
  photoUrl: null,
});

/** 9 cards, all midfielders ⇒ every 7-card pool is a ROYAL_POSITION (str 7). */
function allMidDeck(): DealtCard[] {
  return Array.from({ length: 9 }, (_, i) => card(`p${i}`, "MID", `N${i}`));
}

function player(seat: number, userId: string): RoomPlayer {
  return {
    seat,
    userId,
    username: userId,
    playerNumber: 100000 + seat,
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
  };
}

function makeRoom(deck: DealtCard[]): {
  room: GameRoom;
  persistence: FakePersistence;
  emitter: FakeEmitter;
  timers: ManualTimers;
} {
  const state: RoomState = {
    gameId: "g1",
    roomName: "Test Room",
    inviteCode: "INV1",
    createdBy: "u1",
    maxPlayers: 6,
    isPrivate: false,
    config: { ...DEFAULT_GAME_CONFIG },
    status: "LOBBY",
    phase: "LOBBY",
    players: [player(1, "u1"), player(2, "u2")],
    community: [],
    communityRevealed: 0,
    dealerSeat: null,
    currentTurnSeat: null,
    currentBet: 0n,
    turnDeadlineTs: null,
    ranks: RANKS,
  };
  const persistence = new FakePersistence();
  const emitter = new FakeEmitter();
  const timers = new ManualTimers();
  const deps: RoomDeps = {
    cards: new FakeCards(deck),
    persistence,
    emitter,
    timers,
    clock,
  };
  return { room: new GameRoom(state, deps), persistence, emitter, timers };
}

const roomEvents = (e: FakeEmitter, name: string) =>
  e.room.filter((x) => x.event === name);

// --- tests -----------------------------------------------------------------

describe("hand flow: check-down to a split showdown", () => {
  it("deals privately, posts antes, walks all streets, and splits the pot", async () => {
    const { room, persistence, emitter, timers } = makeRoom(allMidDeck());

    await room.start();

    // Hole cards went privately to each seat (never to the room).
    expect(emitter.seat.filter((s) => s.event === "game:dealt")).toHaveLength(2);
    expect(roomEvents(emitter, "game:dealt")).toHaveLength(0);

    // Two antes of 50 were debited.
    const antes = persistence.movements.filter((m) => m.type === "ANTE");
    expect(antes).toHaveLength(2);
    expect(antes.every((m) => m.amount === -50n)).toBe(true);

    expect(room.state.phase).toBe("PREFLOP");
    expect(room.state.currentTurnSeat).toBe(2); // seat after dealer (1)

    // Check the hand down: 2 then 1 on every street.
    await room.placeAction(2, { type: "CHECK" }, "a1");
    await room.placeAction(1, { type: "CHECK" }, "a2");
    expect(room.state.phase).toBe("FLOP");
    expect(room.state.communityRevealed).toBe(3);

    await room.placeAction(2, { type: "CHECK" }, "a3");
    await room.placeAction(1, { type: "CHECK" }, "a4");
    expect(room.state.phase).toBe("TURN");
    expect(room.state.communityRevealed).toBe(4);

    await room.placeAction(2, { type: "CHECK" }, "a5");
    await room.placeAction(1, { type: "CHECK" }, "a6");
    expect(room.state.phase).toBe("RIVER");
    expect(room.state.communityRevealed).toBe(5);

    await room.placeAction(2, { type: "CHECK" }, "a7");
    await room.placeAction(1, { type: "CHECK" }, "a8");
    expect(room.state.phase).toBe("SHOWDOWN");
    expect(roomEvents(emitter, "showdown:start")).toHaveLength(1);
    expect(timers.pending.has("claim")).toBe(true);

    // Both validly claim ROYAL_POSITION (every pool is 7 midfielders).
    await room.selectClaim(2, "ROYAL_POSITION");
    await room.selectClaim(1, "ROYAL_POSITION");

    expect(room.state.phase).toBe("ENDED");
    expect(persistence.claims.every((c) => c.valid)).toBe(true);

    const splits = persistence.settlements.filter((m) => m.type === "SPLIT_WIN");
    expect(splits).toHaveLength(2);
    expect(splits.every((m) => m.amount === 50n)).toBe(true); // 100 pot / 2

    const result = roomEvents(emitter, "game:result").at(-1)!.payload;
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r: any) => r.coinsDelta === 0)).toBe(true);
  });
});

describe("hand flow: fold to last player standing", () => {
  it("ends immediately and the survivor sweeps the pot including the forfeit", async () => {
    const { room, persistence } = makeRoom(allMidDeck());
    await room.start();

    expect(room.state.currentTurnSeat).toBe(2);
    await room.placeAction(2, { type: "FOLD" }, "f1");

    expect(room.state.phase).toBe("ENDED");

    // Folder (seat 2) was refunded ante − forfeit = 25 immediately.
    const refund = persistence.movements.find(
      (m) => m.type === "REFUND" && m.reference.includes("foldrefund"),
    );
    expect(refund?.amount).toBe(25n);

    // Survivor (seat 1) wins the whole pot: own 50 + 25 forfeit = 75.
    const win = persistence.settlements.find((m) => m.type === "WIN");
    expect(win).toEqual({ seat: 1, type: "WIN", amount: 75n });
    // No FOLD_FORFEIT sink: the forfeit reached the winner.
    expect(persistence.settlements.some((m) => m.type === "FOLD_FORFEIT")).toBe(false);
  });
});

describe("turn enforcement", () => {
  it("rejects an action from the wrong seat", async () => {
    const { room } = makeRoom(allMidDeck());
    await room.start();
    // Seat 1 is the dealer; seat 2 acts first.
    await expect(room.placeAction(1, { type: "CHECK" }, "x1")).rejects.toThrow(
      /Not your turn/,
    );
  });
});
