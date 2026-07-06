import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GpFactPack } from "@fb/guess-player-engine";
import type { GpAskInput, GpStateView } from "@fb/shared";
import { GpMatches } from "../src/match.js";
import { attachSocketHandlers } from "../src/socket.js";
import type { GpFactsSource, ResolvedAsk } from "../src/facts.js";

/**
 * SOCKET-LAYER integration tests (real socket.io server + clients, fake
 * facts/persistence, REAL timers). These pin the create-room → waiting lobby
 * → join → explicit start flow, and the regression where a stale grace-held
 * seat used to swallow an explicit create/join and drop the player into an
 * old LIVE table instead of a fresh lobby.
 */

const HIDDEN_POOL = Array.from(
  { length: 10 },
  (_, i) => `77777777-7777-4777-8777-77777777777${i}`,
);

function packFor(playerId: string): GpFactPack {
  return {
    playerId,
    name: "Hidden",
    nameAr: "الخفي",
    nationalityName: "Egypt",
    clubIdsEver: [],
    clubSeasons: [],
    seasonsWithClubData: [],
    nationalTeamCountries: ["Egypt"],
    nationalTeamsComplete: true,
    competitionIdsEver: [],
    competitionSeasons: [],
    seasonsWithCompleteCompetitionData: [],
    seasonLines: [],
    trophies: [],
    trophiesImported: true,
  };
}

const fakeFacts: GpFactsSource = {
  pickHidden: async (_d, used) => {
    const id = HIDDEN_POOL.find((x) => !used.has(x));
    return id ? { ref: { id, name: "Hidden", nameAr: "الخفي", photoUrl: null }, pack: packFor(id) } : null;
  },
  loadHidden: async (id) => ({ ref: { id, name: "Hidden", nameAr: "الخفي", photoUrl: null }, pack: packFor(id) }),
  resolveAsk: async (_input: GpAskInput): Promise<ResolvedAsk | null> => null,
  resolvePlayer: async (id) => ({ id, name: "Named", nameAr: null, photoUrl: null }),
};

const noopPersist = {
  createMatch: vi.fn(async () => {}),
  createRound: vi.fn(async () => "round-db-id"),
  saveQuestion: vi.fn(async () => {}),
  saveGuess: vi.fn(async () => {}),
  finishRound: vi.fn(async () => {}),
  awardXp: vi.fn(async () => {}),
  markWithdrawn: vi.fn(async () => {}),
  finishMatch: vi.fn(async () => {}),
};

type Harness = {
  url: string;
  io: Server;
  http: HttpServer;
  matches: GpMatches;
  clients: ClientSocket[];
};

async function startHarness(): Promise<Harness> {
  const http = createServer();
  const io = new Server(http);
  const matches = new GpMatches({
    facts: fakeFacts,
    persist: noopPersist,
    emit: (target, event, payload) => io.to(target).emit(event, payload),
  });
  // Test identity middleware: trust the handshake claims directly (the real
  // server verifies the signed realtime token here).
  io.use((socket, next) => {
    socket.data.user = socket.handshake.auth.claims;
    next();
  });
  attachSocketHandlers(io, matches);
  await new Promise<void>((r) => http.listen(0, r));
  const { port } = http.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, io, http, matches, clients: [] };
}

function stopHarness(h: Harness): Promise<void> {
  for (const c of h.clients) c.disconnect();
  // Drop every room (clears round/idle timers) and any seat grace timers so
  // real setTimeout handles never outlive the test.
  for (const room of h.matches.list()) {
    for (const s of room.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
    h.matches.removeRoom(room.id);
  }
  h.io.close();
  return new Promise((r) => h.http.close(() => r()));
}

type TestClient = ClientSocket & { states: GpStateView[] };

function player(h: Harness, id: string, name: string): TestClient {
  const c = connectClient(h.url, {
    auth: { claims: { userId: id, username: name, playerNumber: 1 } },
    forceNew: true,
  }) as TestClient;
  // Buffer every state from the moment the socket exists — resync/create
  // snapshots often land BEFORE a test attaches its assertion listener.
  c.states = [];
  c.on("gp:state", (s: GpStateView) => c.states.push(s));
  h.clients.push(c);
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
  pred: (s: GpStateView) => boolean,
  timeoutMs = 3000,
): Promise<GpStateView> => {
  const hit = [...socket.states].reverse().find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for state")), timeoutMs);
    const on = (s: GpStateView) => {
      if (!pred(s)) return;
      clearTimeout(t);
      socket.off("gp:state", on);
      resolve(s);
    };
    socket.on("gp:state", on);
  });
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Guess the Player socket flow — create → lobby → join → start", () => {
  let h: Harness;
  beforeEach(async () => {
    vi.clearAllMocks();
    h = await startHarness();
  });
  afterEach(async () => {
    await stopHarness(h);
  });

  it("create opens a WAITING LOBBY — never a live round", async () => {
    const a = player(h, "user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string }>(a, "gp:create", {
      mode: "VS_HUMANS",
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
    expect(h.matches.get(ack.matchId)?.status).toBe("LOBBY");
  });

  it("join via invite code lands in the SAME lobby; only the creator's start begins round 1 (VS_HUMANS picker = creator)", async () => {
    const a = player(h, "user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string }>(a, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-create-2",
    });
    const b = player(h, "user-b", "B");
    const joinAck = await emitAck<{ matchId?: string; error?: string }>(b, "gp:join", {
      inviteCode: ack.inviteCode,
    });
    expect(joinAck.matchId).toBe(ack.matchId);
    const lobby = await stateWhere(b, (s) => s.seats.length === 2);
    expect(lobby.status).toBe("LOBBY");

    // A non-creator start is ignored — still a lobby.
    b.emit("gp:start", {});
    await sleep(300);
    expect(h.matches.get(ack.matchId)?.status).toBe("LOBBY");

    // The creator's explicit start begins round 1 with the creator picking.
    a.emit("gp:start", {});
    const live = await stateWhere(b, (s) => s.status === "IN_PROGRESS");
    expect(live.roundNo).toBe(1);
    expect(live.phase).toBe("PICKING");
    const creatorSeat = live.seats.find((s) => s.userId === "user-a")!;
    expect(creatorSeat.isPicker).toBe(true);
  });

  it("REGRESSION: a stale grace-held LIVE table never swallows a NEW create — the user gets a fresh lobby and the old solo table closes", async () => {
    // Simulate the reported repro: the user's old quick-play table is still
    // alive (their seat grace-held after navigating away)…
    const qp = h.matches.createQuickPlay("EASY");
    h.matches.addSeat(qp, { userId: "user-a", username: "A", playerNumber: 1 });
    h.matches.start(qp, "user-a", true); // solo quick play (approved)
    await sleep(50);
    expect(h.matches.get(qp.id)?.status).toBe("IN_PROGRESS");

    // …then they open create-room and create (fresh nonce = deliberate).
    const a = player(h, "user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string | null }>(a, "gp:create", {
      mode: "VS_SYSTEM",
      difficulty: "MEDIUM",
      isPrivate: false,
      nonce: "n-fresh",
    });
    expect(ack.matchId).not.toBe(qp.id); // NOT resynced into the old table
    expect(ack.inviteCode).toBeTruthy();
    const st = await stateWhere(a, (s) => s.matchId === ack.matchId);
    expect(st.status).toBe("LOBBY");
    expect(st.kind).toBe("MANUAL");
    // The abandoned solo table closed via the normal lifecycle.
    expect(h.matches.get(qp.id)).toBeUndefined();
  });

  it("reloading the same create URL resyncs the SAME room (no duplicate)", async () => {
    const a1 = player(h, "user-a", "A");
    const ack1 = await emitAck<{ matchId: string }>(a1, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-reload",
    });
    a1.disconnect();
    await sleep(100);
    // Same URL → same nonce on a fresh socket.
    const a2 = player(h, "user-a", "A");
    const ack2 = await emitAck<{ matchId: string }>(a2, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-reload",
    });
    expect(ack2.matchId).toBe(ack1.matchId);
    expect(h.matches.list().filter((r) => r.kind === "MANUAL")).toHaveLength(1);
  });

  it("a started room is unjoinable — nobody is pulled into a round that began before they joined", async () => {
    const a = player(h, "user-a", "A");
    const ack = await emitAck<{ matchId: string; inviteCode: string }>(a, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-started",
    });
    const b = player(h, "user-b", "B");
    await emitAck(b, "gp:join", { inviteCode: ack.inviteCode });
    a.emit("gp:start", {});
    await stateWhere(a, (s) => s.status === "IN_PROGRESS");

    const c = player(h, "user-c", "C");
    const joinAck = await emitAck<{ error?: string }>(c, "gp:join", { inviteCode: ack.inviteCode });
    expect(joinAck.error).toBe("NOT_FOUND");
    expect(h.matches.get(ack.matchId)!.seats.some((s) => s.userId === "user-c")).toBe(false);
  });

  it("joining a DIFFERENT room by code releases a stale lobby seat (old empty lobby is dropped)", async () => {
    // A created a room earlier and navigated away (seat grace-held).
    const a1 = player(h, "user-a", "A");
    const oldAck = await emitAck<{ matchId: string }>(a1, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-old",
    });
    a1.disconnect();
    // B opens a fresh room and shares the link with A.
    const b = player(h, "user-b", "B");
    const bAck = await emitAck<{ matchId: string; inviteCode: string }>(b, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-b",
    });
    const a2 = player(h, "user-a", "A");
    const joinAck = await emitAck<{ matchId?: string }>(a2, "gp:join", { inviteCode: bAck.inviteCode });
    expect(joinAck.matchId).toBe(bAck.matchId); // landed in B's lobby…
    await stateWhere(a2, (s) => s.matchId === bAck.matchId && s.seats.length === 2);
    expect(h.matches.get(oldAck.matchId)).toBeUndefined(); // …and the old empty lobby is gone
  });

  it("REGRESSION: the WITHDRAWN seat left behind in the old (still-running) table never shadows the new room — a same-nonce reload resyncs the NEW lobby", async () => {
    // Old multi-human table keeps playing after A withdraws, so A's seat stays
    // in its seats array with status WITHDRAWN (needed for the standings)…
    const qp = h.matches.createQuickPlay("EASY");
    h.matches.addSeat(qp, { userId: "user-a", username: "A", playerNumber: 1 });
    h.matches.addSeat(qp, { userId: "user-x", username: "X", playerNumber: 2 });
    h.matches.addSeat(qp, { userId: "user-y", username: "Y", playerNumber: 3 });
    h.matches.start(qp, "user-a");
    await sleep(50);
    expect(h.matches.get(qp.id)?.status).toBe("IN_PROGRESS");

    const a = player(h, "user-a", "A");
    const ack = await emitAck<{ matchId: string }>(a, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-shadow",
    });
    expect(ack.matchId).not.toBe(qp.id);
    expect(h.matches.get(qp.id)?.status).toBe("IN_PROGRESS"); // others keep playing
    expect(h.matches.get(qp.id)?.seats.find((s) => s.userId === "user-a")?.status).toBe("WITHDRAWN");

    // …reloading the create URL (same nonce) must resync the NEW lobby, not the
    // old table whose withdrawn seat still carries A's userId.
    const ack2 = await emitAck<{ matchId: string }>(a, "gp:create", {
      mode: "VS_HUMANS",
      isPrivate: false,
      nonce: "n-shadow",
    });
    expect(ack2.matchId).toBe(ack.matchId);
    expect(h.matches.list().filter((r) => r.kind === "MANUAL")).toHaveLength(1);
  });

  it("the creator leaving the lobby before start drops the empty room", async () => {
    const a = player(h, "user-a", "A");
    const ack = await emitAck<{ matchId: string }>(a, "gp:create", {
      mode: "VS_SYSTEM",
      difficulty: "EASY",
      isPrivate: true,
      nonce: "n-leave",
    });
    a.emit("gp:leave", {});
    await sleep(200);
    expect(h.matches.get(ack.matchId)).toBeUndefined();
  });
});
