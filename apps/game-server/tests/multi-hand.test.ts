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
 * Feature #7 — multi-hand sessions with dealer rotation. Exercises the room
 * running several hands in a row (no DB, no sockets) and asserts the
 * non-negotiables hold ACROSS hands: the button rotates, wallet balances stay
 * correct (and conserved when there's no forfeit sink), stats are counted
 * exactly once per hand, the single-resolve guard holds per hand, and a player
 * who busts or leaves between hands is dropped gracefully without breaking it.
 */

// --- fakes -----------------------------------------------------------------

class FakeCards implements CardSource {
  constructor(private readonly deck: DealtCard[]) {}
  async dealHand(seatCount: number, holePerSeat: number) {
    return dealFromDeck(this.deck, seatCount, holePerSeat);
  }
}

/**
 * An in-memory ledger: applies every movement/settlement to per-user balances
 * so getBalances reflects reality hand-to-hand (the real wallet does the same
 * via the DB). This is what lets us assert balances across the whole session.
 */
class LedgerPersistence implements RoomPersistence {
  readonly balances = new Map<string, bigint>();
  readonly gamesPlayed = new Map<string, number>();
  readonly settlements: Settlement[] = [];
  readonly movements: LedgerMovement[] = [];
  resolveCalls = 0;

  constructor(initial: Record<string, bigint>) {
    for (const [k, v] of Object.entries(initial)) this.balances.set(k, v);
  }
  async getBalances(userIds: string[]) {
    return new Map(userIds.map((id) => [id, this.balances.get(id) ?? 0n]));
  }
  async persistDeal() {}
  async applyBetting(_g: string, m: LedgerMovement[], _b: BetRecord[]) {
    for (const mv of m) {
      const next = (this.balances.get(mv.userId) ?? 0n) + mv.amount;
      if (next < 0n) throw new Error(`balance went negative for ${mv.userId}`);
      this.balances.set(mv.userId, next);
      this.movements.push(mv);
    }
  }
  async persistClaim() {
    // Yield a real tick so concurrent selectClaim calls genuinely interleave.
    await Promise.resolve();
  }
  async persistResolve(_g: string, settlements: Settlement[], players: RoomPlayer[]) {
    this.resolveCalls += 1;
    const seatUser = new Map(players.map((p) => [p.seat, p.userId]));
    for (const s of settlements) {
      const u = seatUser.get(s.seat);
      if (u) this.balances.set(u, (this.balances.get(u) ?? 0n) + s.amount);
    }
    // Stats are credited once per participant per hand (no cross-hand dup).
    for (const p of players) {
      if (p.committedTotal > 0n || p.forfeit > 0n) {
        this.gamesPlayed.set(p.userId, (this.gamesPlayed.get(p.userId) ?? 0) + 1);
      }
    }
    this.settlements.push(...settlements);
  }
  async closeGame(_g: string, refunds: LedgerMovement[]) {
    for (const m of refunds) {
      this.balances.set(m.userId, (this.balances.get(m.userId) ?? 0n) + m.amount);
      this.movements.push(m);
    }
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

/** Every card is a midfielder ⇒ every 7-card pool is a valid ROYAL_POSITION
 *  (strength 7). Distinct nationalities so position is the only royal in play. */
function midDeck(n = 20): DealtCard[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`,
    name: `p${i}`,
    nationality: `N${i}`,
    position: "MID",
    clubs: [],
    photoUrl: null,
  }));
}

function player(seat: number, userId: string): RoomPlayer {
  return {
    seat,
    userId,
    username: userId,
    playerNumber: 100000 + seat,
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
  };
}

function makeRoom(seats: Array<[number, string]>, balances: Record<string, bigint>) {
  const state: RoomState = {
    gameId: "g1",
    roomName: "Test Room",
    inviteCode: "INV1",
    createdBy: seats[0]![1],
    maxPlayers: 6,
    isPrivate: false,
    config: { ...DEFAULT_GAME_CONFIG },
    status: "LOBBY",
    phase: "LOBBY",
    players: seats.map(([s, u]) => player(s, u)),
    community: [],
    communityRevealed: 0,
    handNumber: 0,
    dealerSeat: null,
    currentTurnSeat: null,
    currentBet: 0n,
    turnDeadlineTs: null,
    ranks: RANKS,
  };
  const persistence = new LedgerPersistence(balances);
  const emitter = new FakeEmitter();
  const timers = new ManualTimers();
  const deps: RoomDeps = {
    cards: new FakeCards(midDeck()),
    persistence,
    emitter,
    timers,
    clock,
  };
  return { room: new GameRoom(state, deps), persistence, emitter, timers };
}

const BETTING = new Set(["PREFLOP", "FLOP", "TURN", "RIVER"]);
const seatOf = (room: GameRoom, s: number) =>
  room.state.players.find((p) => p.seat === s)!;
const contenders = (room: GameRoom) =>
  room.state.players.filter((p) => p.status === "ACTIVE" || p.status === "ALLIN");

/** Check the hand down every street until showdown (or the hand ends early). */
async function checkDown(room: GameRoom): Promise<void> {
  let guard = 0;
  while (BETTING.has(room.state.phase) && room.state.currentTurnSeat !== null && guard < 80) {
    await room.placeAction(room.state.currentTurnSeat, { type: "CHECK" });
    guard++;
  }
}

/** Play one full hand to a showdown where each contender claims `rankBySeat`. */
async function playHand(
  room: GameRoom,
  rankBySeat: (seat: number) => string = () => "ROYAL_POSITION",
): Promise<void> {
  await checkDown(room);
  expect(room.state.phase).toBe("SHOWDOWN");
  for (const p of contenders(room)) await room.selectClaim(p.seat, rankBySeat(p.seat));
  expect(room.state.phase).toBe("ENDED");
}

// --- tests -----------------------------------------------------------------

describe("dealer button rotates each hand", () => {
  it("moves to the next active seat every hand, wrapping around", async () => {
    const { room } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ],
      { a: 5000n, b: 5000n, c: 5000n },
    );

    const dealers: Array<number | null> = [];
    await room.start();
    dealers.push(room.state.dealerSeat); // hand 1
    await playHand(room);

    for (let h = 0; h < 3; h++) {
      await room.startNextHand();
      dealers.push(room.state.dealerSeat);
      await playHand(room);
    }

    // Button starts at the lowest seat then rotates 1 → 2 → 3 → wrap to 1.
    expect(dealers).toEqual([1, 2, 3, 1]);
    expect(room.state.handNumber).toBe(4);
  });

  it("first-to-act follows the rotated button (seat after the dealer)", async () => {
    const { room } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ],
      { a: 5000n, b: 5000n, c: 5000n },
    );
    await room.start();
    expect(room.state.dealerSeat).toBe(1);
    expect(room.state.currentTurnSeat).toBe(2); // after dealer 1
    await playHand(room);

    await room.startNextHand();
    expect(room.state.dealerSeat).toBe(2);
    expect(room.state.currentTurnSeat).toBe(3); // after dealer 2
  });
});

describe("wallet balances stay correct across hands", () => {
  it("conserves total coins across many split hands (no forfeit sink)", async () => {
    const { room, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ],
      { a: 1000n, b: 1000n, c: 1000n },
    );
    const total = () => [...persistence.balances.values()].reduce((s, v) => s + v, 0n);
    const start = total();

    await room.start();
    await playHand(room);
    for (let h = 0; h < 4; h++) {
      await room.startNextHand();
      await playHand(room);
    }

    // Even split each hand ⇒ everyone nets zero; the economy is conserved.
    expect(total()).toBe(start);
    expect(persistence.balances.get("a")).toBe(1000n);
    expect(persistence.balances.get("b")).toBe(1000n);
    expect(persistence.balances.get("c")).toBe(1000n);
    // No FOLD_FORFEIT sink across the whole session.
    expect(persistence.settlements.some((s) => s.type === "FOLD_FORFEIT")).toBe(false);
    // No in-memory balance ever went negative.
    expect(room.state.players.every((p) => p.available >= 0n)).toBe(true);
  });

  it("never charges the same ante/resolve reference twice across hands", async () => {
    const { room, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
      ],
      { a: 1000n, b: 1000n },
    );
    await room.start();
    await playHand(room);
    await room.startNextHand();
    await playHand(room);

    const refs = persistence.movements.map((m) => m.reference);
    expect(new Set(refs).size).toBe(refs.length); // all references unique
    // Antes are salted per hand, so hand 1 and hand 2 antes differ.
    const antes = persistence.movements.filter((m) => m.type === "ANTE").map((m) => m.reference);
    expect(antes).toContain("g1:h1:ante:1");
    expect(antes).toContain("g1:h2:ante:1");
  });
});

describe("stats are counted once per hand (no duplication across the session)", () => {
  it("resolves exactly once per hand and credits each participant one game per hand", async () => {
    const { room, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ],
      { a: 5000n, b: 5000n, c: 5000n },
    );
    await room.start();
    await playHand(room);
    for (let h = 0; h < 2; h++) {
      await room.startNextHand();
      await playHand(room);
    }

    expect(persistence.resolveCalls).toBe(3); // 3 hands → 3 resolves
    expect(persistence.gamesPlayed.get("a")).toBe(3);
    expect(persistence.gamesPlayed.get("b")).toBe(3);
    expect(persistence.gamesPlayed.get("c")).toBe(3);
  });

  it("holds the single-resolve guard independently on each hand (concurrent claims)", async () => {
    const { room, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
      ],
      { a: 5000n, b: 5000n },
    );
    await room.start();
    await checkDown(room);
    await Promise.all([
      room.selectClaim(2, "ROYAL_POSITION"),
      room.selectClaim(1, "ROYAL_POSITION"),
    ]);
    expect(persistence.resolveCalls).toBe(1);

    await room.startNextHand();
    await checkDown(room);
    await Promise.all([
      room.selectClaim(room.state.currentTurnSeat ?? 1, "ROYAL_POSITION"),
      ...contenders(room)
        .map((p) => p.seat)
        .filter((s) => s !== (room.state.currentTurnSeat ?? 1))
        .map((s) => room.selectClaim(s, "ROYAL_POSITION")),
    ]);
    // Each hand resolved exactly once — the guard reset per hand and held again.
    expect(persistence.resolveCalls).toBe(2);
    const splits = persistence.settlements.filter((m) => m.type === "SPLIT_WIN");
    expect(splits).toHaveLength(4); // 2 per hand × 2 hands, never doubled
  });
});

describe("between hands: explicit deal gate (Batch 1 — no auto-deal)", () => {
  it("does NOT auto-arm a next-hand timer; the room waits at ENDED until startNextHand", async () => {
    const { room, timers, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
      ],
      { a: 5000n, b: 5000n },
    );
    await room.start();
    await playHand(room);

    // Hand ended; the room is parked between hands with NO auto-deal timer and
    // NO antes charged for a next hand.
    expect(room.state.phase).toBe("ENDED");
    expect(timers.pending.has("nexthand")).toBe(false);
    const antesAfterHand1 = persistence.movements.filter((m) => m.type === "ANTE").length;
    expect(antesAfterHand1).toBe(2); // only hand 1's antes

    // The explicit trigger deals the next hand (and only now charges antes).
    await room.startNextHand();
    expect(room.state.phase).toBe("PREFLOP");
    expect(room.state.handNumber).toBe(2);
    expect(persistence.movements.filter((m) => m.type === "ANTE").length).toBe(4);
  });
});

describe("hand:started mirrors authoritative post-ante state (Batch 1, item 1)", () => {
  it("carries committedThisRound=ante, pot=ante*n, currentBet=ante so the client owes 0 preflop", async () => {
    const { room, emitter } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
      ],
      { a: 1000n, b: 1000n },
    );
    await room.start();

    const hs = emitter.room.filter((e) => e.event === "hand:started").at(-1)!.payload as {
      pot: number;
      currentBet: number;
      players: Array<{ committedThisRound: number; committedTotal: number }>;
    };
    // The ante is already reflected — the client mirrors these instead of
    // re-deriving, so amount-to-call = currentBet − committedThisRound = 0.
    expect(hs.pot).toBe(100);
    expect(hs.currentBet).toBe(50);
    expect(hs.players.every((p) => p.committedThisRound === 50)).toBe(true);
    expect(hs.players.every((p) => p.committedTotal === 50)).toBe(true);
  });
});

describe("claim timer: not choosing in time forfeits the claim (decision 19.6)", () => {
  it("a contender who never claims loses to the valid claimant when the timer fires", async () => {
    const { room, persistence, timers } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
      ],
      { a: 5000n, b: 5000n },
    );
    await room.start();
    await checkDown(room);
    expect(room.state.phase).toBe("SHOWDOWN");

    // Only seat 1 claims (valid). Seat 2 never chooses → still unresolved.
    await room.selectClaim(1, "ROYAL_POSITION");
    expect(room.state.phase).toBe("SHOWDOWN");

    // The claim timer fires → resolve with seat 2 forfeiting its claim.
    const fire = timers.pending.get("claim");
    expect(fire).toBeTruthy();
    fire!();
    await new Promise((r) => setTimeout(r, 0));

    expect(room.state.phase).toBe("ENDED");
    expect(persistence.resolveCalls).toBe(1);
    // Seat 1 sweeps the whole pot (its 50 + seat 2's forfeited 50).
    const win = persistence.settlements.find((s) => s.type === "WIN");
    expect(win).toMatchObject({ seat: 1, amount: 100n });
    expect(persistence.balances.get("a")).toBe(5050n);
    expect(persistence.balances.get("b")).toBe(4950n);
  });
});

describe("a player who busts is sat out, the room keeps playing", () => {
  it("excludes a busted player from the next hand and continues with the rest", async () => {
    // c keeps making an impossible claim (LINEUP needs all 4 positions, but the
    // all-midfielder pool can't form it) and bleeds 50/hand until it can't ante.
    const { room, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ],
      { a: 5000n, b: 5000n, c: 120n },
    );
    const cLoses = (seat: number) => (seat === 3 ? "LINEUP" : "ROYAL_POSITION");

    await room.start();
    await playHand(room, cLoses); // c: 120 → 70
    await room.startNextHand();
    expect(seatOf(room, 3).status).toBe("ACTIVE"); // 70 ≥ 50, still in
    await playHand(room, cLoses); // c: 70 → 20

    await room.startNextHand(); // c now has 20 < ante 50
    expect(seatOf(room, 3).status).toBe("WAITING"); // sat out
    expect(seatOf(room, 3).holeCards).toHaveLength(0);
    expect(persistence.balances.get("c")).toBe(20n);
    // The hand still started for the two who can pay.
    expect(room.state.phase).toBe("PREFLOP");
    expect([1, 2]).toContain(room.state.currentTurnSeat);
    expect(seatOf(room, 1).status).toBe("ACTIVE");
    expect(seatOf(room, 2).status).toBe("ACTIVE");
  });

  it("parks the room (no deal) when fewer than two players can afford the ante", async () => {
    const { room, emitter } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
      ],
      { a: 5000n, b: 120n },
    );
    const bLoses = (seat: number) => (seat === 2 ? "LINEUP" : "ROYAL_POSITION");
    await room.start();
    await playHand(room, bLoses); // b: 120 → 70
    await room.startNextHand();
    await playHand(room, bLoses); // b: 70 → 20

    await room.startNextHand(); // only a can afford → cannot deal
    expect(room.state.status).toBe("LOBBY");
    expect(room.state.phase).toBe("LOBBY");
    expect(emitter.room.some((e) => e.event === "session:waiting")).toBe(true);
  });
});

describe("a player can leave between hands without breaking the room", () => {
  it("drops the leaver from the next hand and keeps the session alive", async () => {
    const { room, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ],
      { a: 1000n, b: 1000n, c: 1000n },
    );
    await room.start();
    await playHand(room);
    const cBalanceBefore = persistence.balances.get("c");

    room.handlePlayerLeft(3); // c leaves between hands
    expect(seatOf(room, 3).connected).toBe(false);

    await room.startNextHand();
    // c is excluded; the hand runs heads-up between a and b.
    expect(seatOf(room, 3).status).toBe("WAITING");
    expect(seatOf(room, 3).holeCards).toHaveLength(0);
    expect(room.state.phase).toBe("PREFLOP");
    expect(contenders(room).map((p) => p.seat).sort()).toEqual([1, 2]);
    // The leaver's wallet is untouched by the hand they're not in.
    expect(persistence.balances.get("c")).toBe(cBalanceBefore);

    // And the session still resolves cleanly.
    await playHand(room);
    expect(room.state.phase).toBe("ENDED");
  });
});

describe("closing a table mid-hand restores every committed coin (ledger net-zero)", () => {
  it("refunds the antes so both players return to their pre-hand balance", async () => {
    const { room, persistence } = makeRoom(
      [
        [1, "a"],
        [2, "b"],
      ],
      { a: 1000n, b: 1000n },
    );
    await room.start(); // antes 50 each
    expect(persistence.balances.get("a")).toBe(950n);
    expect(persistence.balances.get("b")).toBe(950n);

    await room.close();

    // The live hand is voided: every committed coin is returned through the ledger.
    expect(persistence.balances.get("a")).toBe(1000n);
    expect(persistence.balances.get("b")).toBe(1000n);
    expect(room.state.status).toBe("ABANDONED");
  });
});
