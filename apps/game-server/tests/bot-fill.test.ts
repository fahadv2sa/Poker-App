import { QUICK_PLAY } from "@fb/shared";
import { describe, expect, it } from "vitest";
import { BotIdentityPool } from "../src/bots/pool.js";
import { BotRuntime } from "../src/bots/runtime.js";
import { addBotSeats, fillTarget } from "../src/bots/seating.js";
import type { BotIdentity } from "../src/bots/identities.js";
import type { RoomPlayer, RoomState } from "../src/types.js";

/**
 * Phase 4 — the identity pool, seat-filling, and the BotRuntime facade. All pure
 * (no DB, no sockets): identities are injected, RNG is deterministic.
 */

function identities(n: number, base = 900001): BotIdentity[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `bot-${base + i}`,
    playerNumber: base + i,
    nickname: `لاعب ${i + 1}`,
    username: `bot${base + i}`,
  }));
}

const human = (seat: number, userId = `u${seat}`): RoomPlayer => ({
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
  isBot: false,
});

function state(players: RoomPlayer[], maxPlayers = QUICK_PLAY.maxSeats): RoomState {
  return {
    gameId: "g1",
    roomName: "QP",
    inviteCode: "INV1",
    createdBy: "u1",
    hostUserId: "u1",
    maxPlayers,
    isPrivate: true,
    config: {} as RoomState["config"],
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
    ranks: [],
  };
}

// --- BotIdentityPool -------------------------------------------------------

describe("BotIdentityPool", () => {
  it("acquires distinct free identities and tracks availability", () => {
    const pool = new BotIdentityPool(identities(10));
    expect(pool.total).toBe(10);
    expect(pool.available).toBe(10);
    const a = pool.acquire(4, () => 0);
    expect(a).toHaveLength(4);
    expect(new Set(a.map((i) => i.playerNumber)).size).toBe(4);
    expect(pool.available).toBe(6);
  });

  it("never hands out the same identity twice while in use", () => {
    const pool = new BotIdentityPool(identities(6));
    const a = pool.acquire(4, () => 0);
    const b = pool.acquire(4, () => 0); // only 2 left
    expect(b).toHaveLength(2);
    const overlap = new Set(a.map((i) => i.playerNumber));
    expect(b.some((i) => overlap.has(i.playerNumber))).toBe(false);
    expect(pool.available).toBe(0);
  });

  it("returns identities on release, making them available again", () => {
    const pool = new BotIdentityPool(identities(5));
    const a = pool.acquire(5, () => 0);
    expect(pool.available).toBe(0);
    pool.release(a);
    expect(pool.available).toBe(5);
  });

  it("caps acquisition at what is available and handles count <= 0", () => {
    const pool = new BotIdentityPool(identities(3));
    expect(pool.acquire(10, () => 0)).toHaveLength(3);
    expect(pool.acquire(0)).toHaveLength(0);
  });
});

// --- seating ---------------------------------------------------------------

describe("fillTarget", () => {
  it("stays within [botFillMin, botFillMax], never below current, never above max", () => {
    for (let r = 0; r <= 10; r++) {
      const rng = () => r / 10; // sweep 0..1
      const t = fillTarget(1, QUICK_PLAY.maxSeats, rng);
      expect(t).toBeGreaterThanOrEqual(QUICK_PLAY.botFillMin);
      expect(t).toBeLessThanOrEqual(QUICK_PLAY.botFillMax);
    }
    expect(fillTarget(2, 4, () => 0.999)).toBeLessThanOrEqual(4); // capped at maxPlayers
    expect(fillTarget(6, 6, () => 0)).toBe(6); // never below current player count
  });
});

describe("addBotSeats", () => {
  it("fills the lowest free seats with bot players and respects maxPlayers", () => {
    const st = state([human(1), human(3)], 6); // seats 1 and 3 taken
    const added = addBotSeats(st, identities(3));
    expect(added).toHaveLength(3);
    expect(added.map((p) => p.seat).sort((a, b) => a - b)).toEqual([2, 4, 5]);
    expect(added.every((p) => p.isBot && p.connected && p.status === "WAITING")).toBe(true);
    // The display name is the human-looking nickname.
    expect(added[0]!.username).toBe("لاعب 1");
  });

  it("stops at maxPlayers", () => {
    const st = state([human(1)], 3);
    const added = addBotSeats(st, identities(10));
    expect(added).toHaveLength(2); // 1 human + 2 bots = max 3
    expect(st.players).toHaveLength(3);
  });
});

// --- BotRuntime.fill / release --------------------------------------------

describe("BotRuntime.fill", () => {
  it("tops a cold-start table (1 human) up to a randomized target with bots", () => {
    const rt = new BotRuntime(identities(20), { rng: () => 0 }); // rng 0 ⇒ target = botFillMin
    const st = state([human(1)]);
    const added = rt.fill(st);
    expect(added).toBe(QUICK_PLAY.botFillMin - 1); // 1 human already seated
    const bots = st.players.filter((p) => p.isBot);
    expect(bots).toHaveLength(added);
    expect(new Set(bots.map((p) => p.playerNumber)).size).toBe(added); // distinct
    expect(rt.availableIdentities).toBe(20 - added);
  });

  it("does not fill a healthy all-human table (>= minPlayers)", () => {
    const rt = new BotRuntime(identities(20), { rng: () => 0 });
    const humans = Array.from({ length: QUICK_PLAY.minPlayers }, (_, i) => human(i + 1));
    expect(rt.fill(state(humans))).toBe(0);
    expect(rt.availableIdentities).toBe(20);
  });

  it("does nothing when there are no humans", () => {
    const rt = new BotRuntime(identities(20), { rng: () => 0 });
    expect(rt.fill(state([]))).toBe(0);
  });

  it("seats nothing (and doesn't throw) when the pool is empty", () => {
    const rt = new BotRuntime([], { rng: () => 0 });
    expect(rt.fill(state([human(1)]))).toBe(0);
  });

  it("release returns the table's bot identities to the pool", () => {
    const rt = new BotRuntime(identities(20), { rng: () => 0 });
    const st = state([human(1)]);
    const added = rt.fill(st);
    expect(rt.availableIdentities).toBe(20 - added);
    rt.release(st);
    expect(rt.availableIdentities).toBe(20);
  });
});
