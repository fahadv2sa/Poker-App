import type { Settlement } from "@fb/engine";
import { HAND_RANK_CATALOG, DEFAULT_GAME_CONFIG } from "@fb/shared";
import { describe, expect, it } from "vitest";
import { dealFromDeck } from "../src/cards.js";
import { GameRoom, botStackForSeed, type RoomDeps } from "../src/room.js";
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
 * Phase 2 — bot isolation seams, exercised end-to-end through GameRoom with the
 * same in-memory fakes the room-flow tests use (no DB, no sockets). Bots are
 * driven manually here (the auto turn-driver is Phase 3). These tests assert the
 * hard guarantees:
 *   - a bot NEVER produces a wallet movement, a Bets row, a GameResult/UserStats
 *     write, a PlayEvent, or a balance lookup;
 *   - a human who beats bots is credited the FULL pot (the bot-funded portion is
 *     minted) via the normal ledger path;
 *   - the result broadcast still SHOWS bots (display isn't isolated, only data);
 *   - with no bots seated, behavior is byte-for-byte the same (flag-off parity).
 */

// --- fakes -----------------------------------------------------------------

class FakeCards implements CardSource {
  constructor(private readonly deck: DealtCard[]) {}
  async dealHand(_tableId: string, seatCount: number, holePerSeat: number) {
    return dealFromDeck(this.deck, seatCount, holePerSeat);
  }
  releaseTable() {}
}

class FakePersistence implements RoomPersistence {
  movements: LedgerMovement[] = [];
  bets: BetRecord[] = [];
  settlements: Settlement[] = [];
  resolvedPlayers: RoomPlayer[] = [];
  resolveCalls = 0;
  closeCalls = 0;
  closeRefunds: LedgerMovement[] = [];
  playEvents: PlayEventRecord[] = [];
  aggregated: string[] = [];
  /** Every userId the room ever asked a wallet balance for. */
  balanceQueries: string[] = [];
  constructor(private readonly balances: Record<string, bigint> = {}) {}
  async getBalances(userIds: string[]) {
    this.balanceQueries.push(...userIds);
    return new Map(userIds.map((id) => [id, this.balances[id] ?? 1000n]));
  }
  async persistDeal() {}
  async applyBetting(_g: string, m: LedgerMovement[], b: BetRecord[]) {
    this.movements.push(...m);
    this.bets.push(...b);
  }
  async persistClaim() {}
  async persistResolve(_g: string, s: Settlement[], players: RoomPlayer[]) {
    this.resolveCalls += 1;
    this.settlements.push(...s);
    this.resolvedPlayers.push(...players);
  }
  async closeGame(_g: string, refunds: LedgerMovement[]) {
    this.closeCalls += 1;
    this.closeRefunds.push(...refunds);
    this.movements.push(...refunds);
  }
  async recordPlayEvents(events: PlayEventRecord[]) {
    this.playEvents.push(...events);
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

// --- fixtures --------------------------------------------------------------

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

function basePlayer(seat: number, userId: string, isBot = false): RoomPlayer {
  return {
    seat,
    userId,
    username: userId,
    playerNumber: isBot ? 900000 + seat : 100000 + seat,
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
    isBot,
  };
}

function makeRoom(
  players: RoomPlayer[],
  deck: DealtCard[],
  opts: { balances?: Record<string, bigint>; resolveMode?: "AUTO" | "MANUAL" } = {},
) {
  const state: RoomState = {
    gameId: "g1",
    roomName: "QP",
    inviteCode: "INV1",
    createdBy: players[0]!.userId,
    hostUserId: players[0]!.userId,
    maxPlayers: 6,
    isPrivate: true,
    config: { ...DEFAULT_GAME_CONFIG, resolveMode: opts.resolveMode ?? "AUTO" },
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
  const persistence = new FakePersistence(opts.balances);
  const emitter = new FakeEmitter();
  const timers = new ManualTimers();
  const deps: RoomDeps = {
    cards: new FakeCards(deck),
    persistence,
    emitter,
    timers: timers as RoomDeps["timers"],
    clock,
  };
  return { room: new GameRoom(state, deps), persistence, emitter, timers };
}

/**
 * A rigged 3-seat deck (11 cards): the human (seat 1, dealt first) makes a
 * ROYAL_POSITION (5 midfielders); the two bots make no rank at all. With AUTO
 * resolution the human therefore wins the whole pot — including the bots' antes.
 *   hole order: seat1 = deck[0,1], seat2 = deck[2,3], seat3 = deck[4,5]
 *   community  = deck[6..10]
 */
function riggedDeck(): DealtCard[] {
  return [
    card("h1", "MID", "N0"),
    card("h2", "MID", "N1"), // human holes → MID, MID
    card("b1", "GK", "N2"),
    card("b2", "GK", "N3"), // bot seat2 holes → GK, GK
    card("b3", "GK", "N4"),
    card("b4", "GK", "N5"), // bot seat3 holes → GK, GK
    card("c1", "MID", "N6"),
    card("c2", "MID", "N7"),
    card("c3", "MID", "N8"), // community: 3 MID ...
    card("c4", "GK", "N9"),
    card("c5", "GK", "N10"), // ... + 2 GK
  ];
}

/** Check the hand down (everyone CHECKs in turn) until it leaves the betting streets. */
async function checkDown(room: GameRoom): Promise<void> {
  const streets = new Set(["PREFLOP", "FLOP", "TURN", "RIVER"]);
  let guard = 0;
  while (streets.has(room.state.phase) && room.state.currentTurnSeat != null) {
    if (guard++ > 50) throw new Error("checkDown did not terminate");
    await room.placeAction(room.state.currentTurnSeat, { type: "CHECK" });
  }
}

const isBotUser = (id: string) => id.startsWith("bot");
const roomEvents = (e: FakeEmitter, name: string) => e.room.filter((x) => x.event === name);

// --- tests -----------------------------------------------------------------

describe("bot isolation — a human beats two bots (AUTO)", () => {
  it("isolates every money/stats path while minting the bot-funded pot to the human", async () => {
    const players = [
      basePlayer(1, "u1"), // human
      basePlayer(2, "bot2", true),
      basePlayer(3, "bot3", true),
    ];
    const { room, persistence, emitter } = makeRoom(players, riggedDeck());

    await room.start();
    await checkDown(room);
    expect(room.state.phase).toBe("ENDED");

    // --- balance lookups: humans only, never a bot ---
    expect(persistence.balanceQueries).toEqual(["u1"]);

    // --- ledger: only the human's ante was debited (bots' antes are fake) ---
    const antes = persistence.movements.filter((m) => m.type === "ANTE");
    expect(antes).toHaveLength(1);
    expect(antes[0]!.userId).toBe("u1");
    expect(persistence.movements.every((m) => !isBotUser(m.userId))).toBe(true);

    // --- Bets log: nothing from a bot seat ---
    expect(persistence.bets.every((b) => b.seat === 1)).toBe(true);

    // --- resolve / mint: the human is credited the FULL 150 pot ---
    // (own 50 + the two bots' 50 each). Bot seats are dropped from persistence.
    expect(persistence.resolveCalls).toBe(1);
    expect(persistence.settlements).toEqual([{ seat: 1, type: "WIN", amount: 150n, potIndex: 0 }]);
    expect(persistence.resolvedPlayers.every((p) => !p.isBot)).toBe(true);
    expect(persistence.resolvedPlayers.map((p) => p.seat)).toEqual([1]);

    // --- stats: only the human is recorded/aggregated ---
    expect(persistence.playEvents.every((e) => e.playerId === "u1")).toBe(true);
    expect(persistence.playEvents.filter((e) => e.type === "ROUND_SUMMARY")).toHaveLength(1);
    expect([...new Set(persistence.aggregated)]).toEqual(["u1"]);

    // --- display: the result broadcast STILL shows all three seats ---
    const result = roomEvents(emitter, "game:result").at(-1)!.payload;
    expect(result.results).toHaveLength(3);
    const human = result.results.find((r: any) => r.seat === 1);
    expect(human.outcome).toBe("WIN");
    expect(human.coinsDelta).toBe(100); // won 150, put in 50 ⇒ +100 minted/net
    // The bots are shown as losers (so the human sees a real-looking table).
    expect(result.results.filter((r: any) => r.outcome === "LOSE").map((r: any) => r.seat).sort()).toEqual([2, 3]);
  });
});

describe("bot isolation — a bot folds", () => {
  it("keeps the forfeit in the pot in-memory but writes no ledger refund for the bot", async () => {
    const players = [basePlayer(1, "u1"), basePlayer(2, "bot2", true)];
    const deck = [
      card("h1", "MID", "N0"),
      card("h2", "MID", "N1"),
      card("b1", "GK", "N2"),
      card("b2", "GK", "N3"),
      card("c1", "MID", "N4"),
      card("c2", "MID", "N5"),
      card("c3", "MID", "N6"),
      card("c4", "GK", "N7"),
      card("c5", "GK", "N8"),
    ];
    const { room, persistence } = makeRoom(players, deck);

    await room.start();
    expect(room.state.currentTurnSeat).toBe(2); // the bot acts first
    await room.placeAction(2, { type: "FOLD" });
    expect(room.state.phase).toBe("ENDED");

    // The bot's fold refund is fake: NO foldrefund movement, no bot movement at all.
    expect(persistence.movements.some((m) => m.reference.includes("foldrefund"))).toBe(false);
    expect(persistence.movements.every((m) => !isBotUser(m.userId))).toBe(true);

    // In-memory the forfeit (ante/2 = 25) is kept so the pot math is correct ...
    const bot = room.state.players.find((p) => p.seat === 2)!;
    expect(bot.forfeit).toBe(25n);
    // ... and the human sweeps own 50 + the bot's 25 forfeit = 75 (minted portion 25).
    expect(persistence.settlements).toEqual([{ seat: 1, type: "WIN", amount: 75n, potIndex: 0 }]);
  });
});

describe("bot isolation — closing a live hand with bots", () => {
  it("refunds only the human's stake; bot stakes are fake and never refunded", async () => {
    const players = [
      basePlayer(1, "u1"),
      basePlayer(2, "bot2", true),
      basePlayer(3, "bot3", true),
    ];
    const { room, persistence } = makeRoom(players, riggedDeck());

    await room.start(); // antes posted, PREFLOP
    expect(room.state.phase).toBe("PREFLOP");

    await room.close();

    expect(persistence.closeRefunds).toHaveLength(1);
    expect(persistence.closeRefunds[0]!.userId).toBe("u1");
    expect(persistence.closeRefunds[0]!.amount).toBe(50n);
    expect(persistence.closeRefunds.every((m) => !isBotUser(m.userId))).toBe(true);
    expect(room.state.status).toBe("ABANDONED");
  });
});

describe("bot stack — independent, natural-looking per-bot balance (not human-calibrated)", () => {
  // After start(), the ante has moved from `available` into `committedTotal`, so the
  // seeded bot stack = available + committedTotal.
  const seededBotStack = async (humanBalance: bigint) => {
    const players = [basePlayer(1, "u1"), basePlayer(2, "bot2", true)];
    const { room } = makeRoom(players, riggedDeck(), { balances: { u1: humanBalance } });
    await room.start();
    const bot = room.state.players.find((p) => p.seat === 2)!;
    return bot.available + bot.committedTotal;
  };

  it("does NOT depend on the human stack (independent of the table)", async () => {
    // Same bot, wildly different human balances → identical bot stack.
    expect(await seededBotStack(2500n)).toBe(await seededBotStack(9000n));
    // …and it equals the deterministic per-bot seed value (player_number 900002).
    expect(await seededBotStack(600n)).toBe(botStackForSeed(900002));
  });

  it("is in [1000, 3321] and never a round figure", () => {
    for (let pn = 900001; pn <= 900200; pn++) {
      const v = botStackForSeed(pn);
      expect(v >= 1000n && v <= 3321n).toBe(true);
      expect(v % 50n).not.toBe(0n); // never a round number
    }
  });

  it("differs from one bot to another (no shared figure at a table)", () => {
    const table = [900001, 900002, 900003, 900004, 900005, 900006].map(botStackForSeed);
    expect(new Set(table.map(String)).size).toBe(table.length);
  });
});

describe("flag-off parity — a human-only hand is unaffected by the bot guards", () => {
  it("debits both antes, records both seats' stats, and settles both", async () => {
    // 2 humans, all-midfielder deck ⇒ both pools are ROYAL_POSITION ⇒ split.
    const allMid = Array.from({ length: 9 }, (_, i) => card(`p${i}`, "MID", `N${i}`));
    const players = [basePlayer(1, "u1"), basePlayer(2, "u2")];
    const { room, persistence } = makeRoom(players, allMid);

    await room.start();
    await checkDown(room);
    expect(room.state.phase).toBe("ENDED");

    // Both antes hit the ledger; both seats are aggregated; the pot splits.
    expect(persistence.movements.filter((m) => m.type === "ANTE")).toHaveLength(2);
    expect(persistence.balanceQueries.sort()).toEqual(["u1", "u2"]);
    expect([...new Set(persistence.aggregated)].sort()).toEqual(["u1", "u2"]);
    expect(persistence.playEvents.filter((e) => e.type === "ROUND_SUMMARY")).toHaveLength(2);
    const splits = persistence.settlements.filter((m) => m.type === "SPLIT_WIN");
    expect(splits).toHaveLength(2);
    expect(splits.every((m) => m.amount === 50n)).toBe(true);
  });
});
