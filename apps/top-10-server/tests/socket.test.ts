import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { TT_CLIENT_EVENTS, TT_SERVER_EVENTS, type TtStateView } from "@fb/shared";
import { Matches } from "../src/match.js";
import { attachSocketHandlers } from "../src/socket.js";
import type { CatalogEntry, CatalogSource } from "../src/catalog.js";

/**
 * SOCKET-LAYER integration tests (real socket.io server + clients, fake
 * catalog/persistence, REAL timers) — ported from Guess the Player's suite.
 * These pin the create-room → waiting lobby → join flow, and the regression
 * where a stale grace-held seat used to swallow an explicit create/join and
 * drop the player into an old LIVE table instead of a fresh lobby.
 */

function fakeEntry(id: string): CatalogEntry {
  return {
    id,
    type: "GOAL_SCORERS",
    leagueId: 39,
    competitionName: "PL",
    season: 2024,
    difficulty: "EASY",
    titleAr: "test",
    players: Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1, playerId: `p${i + 1}`, value: 10 - i, name: `P${i + 1}`, nameAr: `لاعب${i + 1}`, photoUrl: null, hints: [],
    })),
  };
}
let seq = 0;
const fakeCatalog = (): CatalogSource => ({ size: 99, pick: () => fakeEntry(`e${seq++}`) }) as unknown as CatalogSource;
const noopPersist = {
  createMatch: async () => {}, saveRound: async () => {}, awardRoundXp: async () => {},
  markWithdrawn: async () => {}, finishMatch: async () => {},
};

let httpServer: HttpServer;
let io: Server;
let matches: Matches;
let port = 0;
let clients: ClientSocket[] = [];

beforeEach(async () => {
  seq = 0;
  clients = [];
  httpServer = createServer();
  io = new Server(httpServer);
  io.use((socket, next) => {
    socket.data.user = socket.handshake.auth.user; // stub auth (identity from handshake)
    next();
  });
  matches = new Matches({ catalog: fakeCatalog(), persist: noopPersist, emit: (id, e, p) => io.to(id).emit(e, p) });
  attachSocketHandlers(io, matches);
  await new Promise<void>((res) => httpServer.listen(0, res));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients) c.disconnect();
  for (const r of matches.list()) {
    for (const s of r.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
    matches.removeRoom(r.id);
  }
  io.close();
  await new Promise<void>((res) => httpServer.close(() => res()));
});

type TestClient = ClientSocket & { states: TtStateView[] };

function player(userId: string, username: string): TestClient {
  const c = ioc(`http://localhost:${port}`, {
    auth: { user: { userId, username, playerNumber: 1 } },
    transports: ["websocket"],
    forceNew: true,
  }) as TestClient;
  // Buffer every state from the moment the socket exists — resync/create
  // snapshots often land BEFORE a test attaches its assertion listener.
  c.states = [];
  c.on(TT_SERVER_EVENTS.state, (s: TtStateView) => c.states.push(s));
  clients.push(c);
  return c;
}

const emitAck = <T>(socket: ClientSocket, event: string, payload: unknown, timeoutMs = 3000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event} ack`)), timeoutMs);
    socket.emit(event, payload, (res: T) => {
      clearTimeout(t);
      resolve(res);
    });
  });

/** Wait until a state matching `pred` arrives — checks already-buffered
 *  states first, then listens. */
const stateWhere = (
  socket: TestClient,
  pred: (s: TtStateView) => boolean,
  timeoutMs = 3000,
): Promise<TtStateView> => {
  const hit = [...socket.states].reverse().find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for state")), timeoutMs);
    const on = (s: TtStateView) => {
      if (!pred(s)) return;
      clearTimeout(t);
      socket.off(TT_SERVER_EVENTS.state, on);
      resolve(s);
    };
    socket.on(TT_SERVER_EVENTS.state, on);
  });
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Top Ten socket flow — create → lobby → join", () => {
  it("create opens a WAITING LOBBY — never a live round", async () => {
    const a = player("user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string }>(a, TT_CLIENT_EVENTS.create, {
      difficulty: "EASY",
      isPrivate: false,
      maxPlayers: 4,
      nonce: "n-create-1",
    });
    expect(ack.inviteCode).toBeTruthy();
    const st = await stateWhere(a, (s) => s.matchId === ack.matchId);
    expect(st.status).toBe("LOBBY");
    expect(st.seats).toHaveLength(1);
    expect(st.roundNo).toBe(0);
    // …and it STAYS a lobby (nothing auto-starts).
    await sleep(400);
    expect(matches.get(ack.matchId)?.status).toBe("LOBBY");
  });

  it("REGRESSION: a stale grace-held LIVE table never swallows a NEW create — the user gets a fresh lobby", async () => {
    // Simulate the trap: the user's old quick-play table is still alive
    // (their seat grace-held after navigating away)…
    const qp = matches.createQuickPlay("EASY");
    matches.addSeat(qp, { userId: "user-a", username: "A", playerNumber: 1 }, false);
    matches.addSeat(qp, { userId: "user-x", username: "X", playerNumber: 2 }, false);
    matches.start(qp, "user-a");
    expect(matches.get(qp.id)?.status).toBe("IN_PROGRESS");

    // …then they open create-room and create (fresh nonce = deliberate).
    const a = player("user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string | null }>(a, TT_CLIENT_EVENTS.create, {
      difficulty: "MEDIUM",
      isPrivate: false,
      nonce: "n-fresh",
    });
    expect(ack.matchId).not.toBe(qp.id); // NOT resynced into the old table
    expect(ack.inviteCode).toBeTruthy();
    const st = await stateWhere(a, (s) => s.matchId === ack.matchId);
    expect(st.status).toBe("LOBBY");
    expect(st.kind).toBe("MANUAL");
    // The stale seat was withdrawn via the normal lifecycle (never still ACTIVE there).
    const old = matches.get(qp.id);
    expect(old?.seats.find((s) => s.userId === "user-a")?.status ?? "WITHDRAWN").toBe("WITHDRAWN");
  });

  it("reloading the same create URL resyncs the SAME room (no duplicate)", async () => {
    const a1 = player("user-a", "A");
    const ack1 = await emitAck<{ matchId: string }>(a1, TT_CLIENT_EVENTS.create, {
      difficulty: "EASY",
      isPrivate: false,
      nonce: "n-reload",
    });
    a1.disconnect();
    await sleep(100);
    // Same URL → same nonce on a fresh socket.
    const a2 = player("user-a", "A");
    const ack2 = await emitAck<{ matchId: string }>(a2, TT_CLIENT_EVENTS.create, {
      difficulty: "EASY",
      isPrivate: false,
      nonce: "n-reload",
    });
    expect(ack2.matchId).toBe(ack1.matchId);
    expect(matches.list().filter((r) => r.kind === "MANUAL")).toHaveLength(1);
  });

  it("REGRESSION: the WITHDRAWN seat left behind in the old (still-running) table never shadows the new room — a same-nonce reload resyncs the NEW lobby", async () => {
    // Old multi-human table keeps playing after A withdraws, so A's seat stays
    // in its seats array with status WITHDRAWN (needed for the standings)…
    const qp = matches.createQuickPlay("EASY");
    matches.addSeat(qp, { userId: "user-a", username: "A", playerNumber: 1 }, false);
    matches.addSeat(qp, { userId: "user-x", username: "X", playerNumber: 2 }, false);
    matches.addSeat(qp, { userId: "user-y", username: "Y", playerNumber: 3 }, false);
    matches.start(qp, "user-a");

    const a = player("user-a", "A");
    const ack = await emitAck<{ matchId: string }>(a, TT_CLIENT_EVENTS.create, {
      difficulty: "MEDIUM",
      nonce: "n-shadow",
    });
    expect(ack.matchId).not.toBe(qp.id);
    expect(matches.get(qp.id)?.status).toBe("IN_PROGRESS"); // others keep playing
    expect(matches.get(qp.id)?.seats.find((s) => s.userId === "user-a")?.status).toBe("WITHDRAWN");

    // …reloading the create URL (same nonce) must resync the NEW lobby, not the
    // old table whose withdrawn seat still carries A's userId.
    const ack2 = await emitAck<{ matchId: string }>(a, TT_CLIENT_EVENTS.create, {
      difficulty: "MEDIUM",
      nonce: "n-shadow",
    });
    expect(ack2.matchId).toBe(ack.matchId);
    expect(matches.list().filter((r) => r.kind === "MANUAL")).toHaveLength(1);
  });

  it("a nonce-less create (legacy deep link) still resyncs — never duplicates", async () => {
    const a = player("user-a", "A");
    const ack1 = await emitAck<{ matchId: string }>(a, TT_CLIENT_EVENTS.create, { difficulty: "EASY" });
    const ack2 = await emitAck<{ matchId: string }>(a, TT_CLIENT_EVENTS.create, { difficulty: "EASY" });
    expect(ack2.matchId).toBe(ack1.matchId);
    expect(matches.list()).toHaveLength(1);
  });

  it("a started room is unjoinable — nobody is pulled into a round that began before they joined", async () => {
    const a = player("user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string }>(a, TT_CLIENT_EVENTS.create, {
      difficulty: "EASY",
      isPrivate: false,
      nonce: "n-started",
    });
    const b = player("user-b", "B");
    await emitAck(b, TT_CLIENT_EVENTS.join, { inviteCode: ack.inviteCode });
    a.emit(TT_CLIENT_EVENTS.start);
    await stateWhere(a, (s) => s.status === "IN_PROGRESS");

    const c = player("user-c", "C");
    const joinAck = await emitAck<{ error?: string }>(c, TT_CLIENT_EVENTS.join, { inviteCode: ack.inviteCode });
    expect(joinAck.error).toBe("NOT_FOUND");
    expect(matches.get(ack.matchId)!.seats.some((s) => s.userId === "user-c")).toBe(false);
  });

  it("joining a DIFFERENT room by code releases a stale lobby seat (old empty lobby is dropped)", async () => {
    // A created a room earlier and navigated away (seat grace-held).
    const a1 = player("user-a", "A");
    const oldAck = await emitAck<{ matchId: string }>(a1, TT_CLIENT_EVENTS.create, {
      difficulty: "EASY",
      isPrivate: false,
      nonce: "n-old",
    });
    a1.disconnect();
    // B opens a fresh room and shares the link with A.
    const b = player("user-b", "B");
    const bAck = await emitAck<{ matchId: string; inviteCode: string }>(b, TT_CLIENT_EVENTS.create, {
      difficulty: "EASY",
      isPrivate: false,
      nonce: "n-b",
    });
    const a2 = player("user-a", "A");
    const joinAck = await emitAck<{ matchId?: string }>(a2, TT_CLIENT_EVENTS.join, { inviteCode: bAck.inviteCode });
    expect(joinAck.matchId).toBe(bAck.matchId); // landed in B's lobby…
    await stateWhere(a2, (s) => s.matchId === bAck.matchId && s.seats.length === 2);
    expect(matches.get(oldAck.matchId)).toBeUndefined(); // …and the old empty lobby is gone
  });

  it("re-joining the SAME room by its own code resyncs it (invite-link reload)", async () => {
    const a = player("user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string }>(a, TT_CLIENT_EVENTS.create, {
      difficulty: "EASY",
      isPrivate: false,
      nonce: "n-same",
    });
    const b1 = player("user-b", "B");
    await emitAck(b1, TT_CLIENT_EVENTS.join, { inviteCode: ack.inviteCode });
    b1.disconnect();
    await sleep(100);
    // B reopens the same invite link on a fresh socket.
    const b2 = player("user-b", "B");
    const joinAck = await emitAck<{ matchId?: string }>(b2, TT_CLIENT_EVENTS.join, { inviteCode: ack.inviteCode });
    expect(joinAck.matchId).toBe(ack.matchId);
    expect(matches.get(ack.matchId)!.seats.filter((s) => s.userId === "user-b")).toHaveLength(1);
  });
});
