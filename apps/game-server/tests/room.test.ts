import type { Settlement } from "@fp/engine";
import { HAND_RANK_CATALOG, DEFAULT_GAME_CONFIG } from "@fp/shared";
import { describe, expect, it } from "vitest";
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
import type { DealtCard, RankInfo, RoomPlayer, RoomState } from "../src/types.js";

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
  /** How many times persistResolve was invoked (must be exactly 1 per hand). */
  resolveCalls = 0;
  /** Per-user wallet balances the room sources `available` from (default 1000). */
  constructor(private readonly balances: Record<string, bigint> = {}) {}
  async getBalances(userIds: string[]) {
    return new Map(userIds.map((id) => [id, this.balances[id] ?? 1000n]));
  }
  async persistDeal() {}
  async applyBetting(_g: string, m: LedgerMovement[], b: BetRecord[]) {
    this.movements.push(...m);
    this.bets.push(...b);
  }
  async persistClaim(_g: string, p: RoomPlayer, _r: string | null, valid: boolean) {
    // Yield a real tick so two concurrent selectClaim calls genuinely interleave
    // (reproduces the simultaneous-claim race).
    await Promise.resolve();
    this.claims.push({ seat: p.seat, valid });
  }
  async persistResolve(_g: string, s: Settlement[]) {
    this.resolveCalls += 1;
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

const RANKS: RankInfo[] = HAND_RANK_CATALOG.map((r) => ({
  id: r.code,
  code: r.code,
  strength: r.strength,
  rule: r.rule,
  nameAr: r.nameAr,
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

function makeRoom(
  deck: DealtCard[],
  balances: Record<string, bigint> = {},
  ranks: RankInfo[] = RANKS,
): {
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
    handNumber: 0,
    dealerSeat: null,
    currentTurnSeat: null,
    currentBet: 0n,
    turnDeadlineTs: null,
    ranks,
  };
  const persistence = new FakePersistence(balances);
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
    await room.placeAction(2, { type: "CHECK" });
    await room.placeAction(1, { type: "CHECK" });
    expect(room.state.phase).toBe("FLOP");
    expect(room.state.communityRevealed).toBe(3);

    await room.placeAction(2, { type: "CHECK" });
    await room.placeAction(1, { type: "CHECK" });
    expect(room.state.phase).toBe("TURN");
    expect(room.state.communityRevealed).toBe(4);

    await room.placeAction(2, { type: "CHECK" });
    await room.placeAction(1, { type: "CHECK" });
    expect(room.state.phase).toBe("RIVER");
    expect(room.state.communityRevealed).toBe(5);

    await room.placeAction(2, { type: "CHECK" });
    await room.placeAction(1, { type: "CHECK" });
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
    await room.placeAction(2, { type: "FOLD" });

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
    await expect(room.placeAction(1, { type: "CHECK" })).rejects.toThrow(
      /Not your turn/,
    );
  });
});

describe("betting balance sourced from the wallet (FIX #2)", () => {
  const seatOf = (room: GameRoom, s: number) =>
    room.state.players.find((p) => p.seat === s)!;

  it("seeds `available` from the wallet and runs ante → raise → call without going negative", async () => {
    const { room } = makeRoom(allMidDeck(), { u1: 500n, u2: 500n });
    await room.start();

    // Wallet 500 − ante 50 = 450 each (not a guessed 0 or 1000).
    expect(seatOf(room, 1).available).toBe(450n);
    expect(seatOf(room, 2).available).toBe(450n);
    expect(room.state.currentTurnSeat).toBe(2);

    // Seat 2 raises to 150 (preflop bet is the 50 ante; commit 100 more).
    await room.placeAction(2, { type: "RAISE", amount: 150n });
    expect(seatOf(room, 2).available).toBe(350n);
    expect(room.state.currentBet).toBe(150n);

    // Seat 1 calls the 100 owed.
    await room.placeAction(1, { type: "CALL" });
    expect(seatOf(room, 1).available).toBe(350n);
    expect(room.state.phase).toBe("FLOP");

    // Invariants: committed 150 each, no negative balances.
    expect(seatOf(room, 1).committedTotal).toBe(150n);
    expect(seatOf(room, 2).committedTotal).toBe(150n);
    expect(room.state.players.every((p) => p.available >= 0n)).toBe(true);
  });

  it("lets a short stack go all-in for exactly its wallet balance (never negative)", async () => {
    const { room } = makeRoom(allMidDeck(), { u1: 1000n, u2: 80n });
    await room.start();

    // u2: wallet 80 − ante 50 = 30 available.
    expect(seatOf(room, 2).available).toBe(30n);

    await room.placeAction(2, { type: "ALLIN" });
    expect(seatOf(room, 2).available).toBe(0n);
    expect(seatOf(room, 2).status).toBe("ALLIN");
    expect(room.state.players.every((p) => p.available >= 0n)).toBe(true);
  });

  it("refuses to start when a player cannot afford the mandatory ante", async () => {
    const { room } = makeRoom(allMidDeck(), { u1: 1000n, u2: 30n });
    await expect(room.start()).rejects.toThrow(/Ante/);
  });
});

describe("server-generated idempotency key (FIX #3)", () => {
  const seatOf = (room: GameRoom, s: number) =>
    room.state.players.find((p) => p.seat === s)!;

  it("derives the wallet reference from server state and a replay cannot double-spend", async () => {
    const { room, persistence } = makeRoom(allMidDeck());
    await room.start();
    expect(room.state.currentTurnSeat).toBe(2);

    await room.placeAction(2, { type: "RAISE", amount: 150n });

    const raises = persistence.movements.filter((m) => m.type === "RAISE");
    expect(raises).toHaveLength(1);
    // Reference is purely server-derived: gameId:act:seat:<server-seq>. No client
    // value can appear here (the client no longer sends an actionId at all).
    expect(raises[0]!.reference).toMatch(/^g1:act:2:\d+$/);

    const before = persistence.movements.length;

    // Replay the SAME action (a duplicated/late emit). The turn already advanced
    // synchronously to seat 1, so the server rejects it — no second debit.
    await expect(room.placeAction(2, { type: "RAISE", amount: 150n })).rejects.toThrow(
      /Not your turn/,
    );
    expect(persistence.movements.length).toBe(before);
    expect(persistence.movements.filter((m) => m.type === "RAISE")).toHaveLength(1);
    // The acting seat's balance moved exactly once (one 100-coin commit).
    expect(seatOf(room, 2).committedTotal).toBe(150n);
  });

  it("assigns distinct, monotonic server keys to successive actions", async () => {
    const { room, persistence } = makeRoom(allMidDeck());
    await room.start();

    await room.placeAction(2, { type: "RAISE", amount: 150n }); // seq 1
    await room.placeAction(1, { type: "CALL" }); // seq 2 (CALL is a BET movement)

    const refs = persistence.movements
      .filter((m) => m.type === "RAISE" || m.type === "BET")
      .map((m) => m.reference);
    expect(refs).toHaveLength(2);
    expect(new Set(refs).size).toBe(2); // unique per action
    expect(refs.every((r) => /^g1:act:\d+:\d+$/.test(r))).toBe(true);
  });
});

describe("private hole-card resync on reconnect (FIX #4)", () => {
  const dealtTo = (e: FakeEmitter, seat: number) =>
    e.seat.filter((x) => x.event === "game:dealt" && x.seat === seat);

  it("re-sends only the reconnecting seat's own hole cards, privately", async () => {
    const { room, emitter } = makeRoom(allMidDeck());
    await room.start();

    // Each seat received its private deal exactly once.
    expect(dealtTo(emitter, 1)).toHaveLength(1);
    expect(dealtTo(emitter, 2)).toHaveLength(1);

    room.resyncSeat(1); // seat 1 reconnects mid-hand

    const resent = dealtTo(emitter, 1);
    expect(resent).toHaveLength(2); // original deal + reconnect resync
    // It carries exactly seat 1's own two hole cards.
    const payload = resent.at(-1)!.payload as { holeCards: Array<{ playerId: string }> };
    expect(payload.holeCards).toHaveLength(2);
    expect(payload.holeCards.map((c) => c.playerId)).toEqual(
      room.state.players.find((p) => p.seat === 1)!.holeCards.map((c) => c.playerId),
    );

    // Privacy: no hole cards ever hit the room broadcast, and seat 2 is untouched.
    expect(emitter.room.some((x) => x.event === "game:dealt")).toBe(false);
    expect(dealtTo(emitter, 2)).toHaveLength(1);
  });

  it("does nothing when the seat has no cards yet (lobby reconnect)", () => {
    const { room, emitter } = makeRoom(allMidDeck());
    room.resyncSeat(1); // hand not started → no hole cards
    expect(emitter.seat.filter((x) => x.event === "game:dealt")).toHaveLength(0);
    expect(emitter.room.some((x) => x.event === "game:dealt")).toBe(false);
  });
});

describe("rank display names are data-driven (FIX #5)", () => {
  it("showdown:start carries the DB name_ar, never the code or a hardcoded map", async () => {
    // Ranks whose nameAr is a sentinel distinct from the code — stands in for the
    // DB-loaded value; it can't come from the rank code or a compile-time catalog.
    const dbRanks: RankInfo[] = HAND_RANK_CATALOG.map((r) => ({
      id: r.code,
      code: r.code,
      strength: r.strength,
      rule: r.rule,
      nameAr: `اسم-من-قاعدة-البيانات-${r.code}`,
    }));
    const { room, emitter } = makeRoom(allMidDeck(), {}, dbRanks);

    await room.start();
    // Check the hand down (2 then 1 each street) to reach showdown.
    for (let i = 0; i < 4; i++) {
      await room.placeAction(2, { type: "CHECK" });
      await room.placeAction(1, { type: "CHECK" });
    }
    expect(room.state.phase).toBe("SHOWDOWN");

    const payload = roomEvents(emitter, "showdown:start").at(-1)!.payload as {
      availableHandRanks: Array<{ code: string; nameAr: string }>;
    };
    const royal = payload.availableHandRanks.find((r) => r.code === "ROYAL_POSITION")!;
    expect(royal.nameAr).toBe("اسم-من-قاعدة-البيانات-ROYAL_POSITION");
    // No rank's display name falls back to its code (no placeholder anywhere).
    expect(payload.availableHandRanks.every((r) => r.nameAr !== r.code)).toBe(true);
  });
});

describe("distributable pot display (FIX #11)", () => {
  it("counts a folder's forfeit in the pot, not its full refunded committed", async () => {
    const { room, emitter } = makeRoom(allMidDeck());
    await room.start(); // antes 50 each

    await room.placeAction(2, { type: "FOLD" });

    const bet = emitter.room
      .filter((e) => e.event === "bet:placed")
      .at(-1)!.payload as { action: string; pot: number };
    expect(bet.action).toBe("FOLD");
    // Seat 1 ante 50 + seat 2 forfeit 25 = 75 — NOT 100 (seat 2's full pre-refund ante).
    expect(bet.pot).toBe(75);
  });
});

describe("simultaneous claims resolve the hand exactly once (race guard)", () => {
  it("never duplicates settlement/results when both players claim at the same time", async () => {
    const { room, persistence } = makeRoom(allMidDeck());
    await room.start();

    // Walk to showdown with both players still in (check down 2 then 1).
    for (let i = 0; i < 4; i++) {
      await room.placeAction(2, { type: "CHECK" });
      await room.placeAction(1, { type: "CHECK" });
    }
    expect(room.state.phase).toBe("SHOWDOWN");

    // Both contenders claim ROYAL_POSITION CONCURRENTLY — the exact race the
    // smoke test surfaced: both selectClaim handlers pass the "all claimed"
    // check after their persistClaim await.
    await Promise.all([
      room.selectClaim(2, "ROYAL_POSITION"),
      room.selectClaim(1, "ROYAL_POSITION"),
    ]);

    expect(room.state.phase).toBe("ENDED");
    // The single-resolve guard ⇒ resolveHand/persistResolve ran exactly once.
    expect(persistence.resolveCalls).toBe(1);
    // A split pays two SPLIT_WIN movements — not four (which is what a double
    // resolve produced before the fix).
    const splits = persistence.settlements.filter((m) => m.type === "SPLIT_WIN");
    expect(splits).toHaveLength(2);
    expect(splits.every((m) => m.amount === 50n)).toBe(true);
  });
});

describe("showdown official reveal + winning association (PROBLEM 2)", () => {
  const royalNameAr = RANKS.find((r) => r.code === "ROYAL_POSITION")!.nameAr;

  it("reveals contenders' hole cards to everyone and reports each claim + the winning rank", async () => {
    const { room, emitter } = makeRoom(allMidDeck());
    await room.start();
    for (let i = 0; i < 4; i++) {
      await room.placeAction(2, { type: "CHECK" });
      await room.placeAction(1, { type: "CHECK" });
    }
    expect(room.state.phase).toBe("SHOWDOWN");
    await room.selectClaim(2, "ROYAL_POSITION");
    await room.selectClaim(1, "ROYAL_POSITION");
    expect(room.state.phase).toBe("ENDED");

    const result = roomEvents(emitter, "game:result").at(-1)!.payload;
    // The winning association is the (DB) Arabic name of the rank that won.
    expect(result.winningRankNameAr).toBe(royalNameAr);

    for (const seat of [1, 2]) {
      const row = result.results.find((r: any) => r.seat === seat);
      expect(row.claimedRankNameAr).toBe(royalNameAr); // each player's pick
      expect(row.holeCards).toHaveLength(2); // revealed at the official reveal
      const expected = room.state.players
        .find((p) => p.seat === seat)!
        .holeCards.map((c) => c.playerId);
      expect(row.holeCards.map((c: any) => c.playerId)).toEqual(expected);
    }
  });

  it("does NOT reveal hole cards when the hand ends by fold (no showdown)", async () => {
    const { room, emitter } = makeRoom(allMidDeck());
    await room.start();
    await room.placeAction(2, { type: "FOLD" }); // seat 1 wins by last-standing

    expect(room.state.phase).toBe("ENDED");
    const result = roomEvents(emitter, "game:result").at(-1)!.payload;
    expect(result.winningRankNameAr).toBeNull();
    for (const row of result.results) {
      expect(row.holeCards).toBeNull(); // privacy held — no official reveal
    }
  });
});
