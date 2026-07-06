import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENT_EVENTS, DEFAULT_GAME_CONFIG, SERVER_EVENTS, type StateSyncPayload } from "@fb/shared";
import { attachSocketHandlers, type SocketDataDeps } from "../src/socket.js";
import { InMemoryRoomStore } from "../src/store.js";
import type { BetRecord, CardSource, LedgerMovement, PlayEventRecord, RoomPersistence } from "../src/ports.js";
import type { RoomState } from "../src/types.js";

/**
 * SOCKET-LAYER integration tests (real socket.io server + clients, injected
 * in-memory data deps — no DB). These pin L-1, "one table at a time": entering
 * a room releases any seat still held in ANOTHER room through the normal leave
 * path, so neither a second tab nor a grace-held seat can accumulate live seats
 * across tables.
 */

const noopPersistence: RoomPersistence = {
  getBalances: async (ids: string[]) => new Map(ids.map((id) => [id, 5000n])),
  persistDeal: async () => {},
  applyBetting: async (_g: string, _m: LedgerMovement[], _b: BetRecord[]) => {},
  persistClaim: async () => {},
  persistResolve: async () => {},
  closeGame: async () => {},
  recordPlayEvents: async (_e: PlayEventRecord[]) => {},
  aggregatePlayers: async () => {},
};

const noopCards: CardSource = {
  dealHand: async () => {
    throw new Error("no hands are dealt in these tests");
  },
  releaseTable: () => {},
};

/** Fresh LOBBY room state, as data.hydrate would load it from the DB (the
 *  creator of both fixture rooms is user-u, mirroring games.created_by). */
function lobbyState(gameId: string, inviteCode: string): RoomState {
  return {
    gameId,
    roomName: `Room ${gameId}`,
    inviteCode,
    createdBy: "user-u",
    hostUserId: "user-u",
    maxPlayers: 6,
    isPrivate: false,
    config: { ...DEFAULT_GAME_CONFIG },
    status: "LOBBY",
    phase: "LOBBY",
    players: [],
    community: [],
    communityRevealed: 0,
    handNumber: 0,
    dealerSeat: null,
    currentTurnSeat: null,
    currentBet: 0n,
    turnDeadlineTs: null,
    ranks: [],
    kind: "MANUAL",
  };
}

// Two fixture rooms, addressable by invite code (as the DB would resolve them).
const GAMES = new Map([
  ["CODEA", "game-a"],
  ["CODEB", "game-b"],
]);

const fakeData: SocketDataDeps = {
  findGameByInvite: async (code) => {
    const id = GAMES.get(code);
    return id ? { id, kind: "MANUAL" } : null;
  },
  getBalance: async () => 5000n,
  hydrate: async (gameId) => {
    const code = [...GAMES.entries()].find(([, id]) => id === gameId)?.[0];
    return code ? lobbyState(gameId, code) : null;
  },
  makeCards: () => noopCards,
  makePersistence: () => noopPersistence,
  touchActivity: () => {},
  createQuickGame: async () => {
    throw new Error("quick play is not exercised here");
  },
};

let httpServer: HttpServer;
let io: Server;
let store: InMemoryRoomStore;
let port = 0;
let clients: ClientSocket[] = [];

beforeEach(async () => {
  clients = [];
  httpServer = createServer();
  io = new Server(httpServer);
  io.use((socket, next) => {
    socket.data.user = socket.handshake.auth.user; // stub auth (identity from handshake)
    next();
  });
  store = new InMemoryRoomStore();
  attachSocketHandlers(io, store, [], undefined, fakeData);
  await new Promise<void>((res) => httpServer.listen(0, res));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients) c.disconnect();
  io.close();
  await new Promise<void>((res) => httpServer.close(() => res()));
});

type TestClient = ClientSocket & {
  states: StateSyncPayload[];
  closedReasons: string[];
};

function connect(userId: string, username = userId): TestClient {
  const c = ioc(`http://localhost:${port}`, {
    auth: { user: { userId, username, playerNumber: 100001 } },
    transports: ["websocket"],
    forceNew: true,
  }) as TestClient;
  c.states = [];
  c.closedReasons = [];
  c.on(SERVER_EVENTS.stateSync, (s: StateSyncPayload) => c.states.push(s));
  c.on(SERVER_EVENTS.roomClosed, (p: { reason: string }) => c.closedReasons.push(p.reason));
  clients.push(c);
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Join a room and wait for the private seat snapshot to come back. */
async function join(c: TestClient, code: string): Promise<StateSyncPayload> {
  const before = c.states.length;
  c.emit(CLIENT_EVENTS.roomJoin, { inviteCode: code });
  for (let i = 0; i < 40; i++) {
    const hit = c.states.slice(before).find((s) => s.yourSeat !== null);
    if (hit) return hit;
    await sleep(25);
  }
  throw new Error(`timeout joining ${code}`);
}

describe("L-1 — one table at a time (room:join releases any other seat)", () => {
  it("REGRESSION: joining a SECOND table releases the first seat; the emptied first table closes", async () => {
    const tab1 = connect("user-u");
    await join(tab1, "CODEA");
    expect(store.get("game-a")).toBeDefined();

    // Second tab, same user, deliberately enters another table.
    const tab2 = connect("user-u");
    const snap = await join(tab2, "CODEB");
    expect(snap.gameId).toBe("game-b");

    await sleep(100);
    // The old (solo) table is gone via the normal empty-teardown…
    expect(store.get("game-a")).toBeUndefined();
    // …and the still-open first tab was told its seat moved (NOT disconnected —
    // an auto-reconnect rejoin would ping-pong the seat between the tables).
    expect(tab1.closedReasons).toContain("SEAT_RELEASED");
    expect(tab1.connected).toBe(true);
  });

  it("a multi-player first table survives: the mover's seat is freed, the other player is notified, host transfers", async () => {
    const u = connect("user-u");
    await join(u, "CODEA"); // U seats first → host
    const v = connect("user-v");
    await join(v, "CODEA");

    const playerLeft: Array<{ seat: number }> = [];
    v.on(SERVER_EVENTS.playerLeft, (p: { seat: number }) => playerLeft.push(p));

    const u2 = connect("user-u");
    await join(u2, "CODEB");
    await sleep(100);

    const roomA = store.get("game-a")!;
    expect(roomA).toBeDefined(); // V is still there — no teardown
    const uSeat = roomA.state.players.find((p) => p.userId === "user-u")!;
    expect(uSeat.connected).toBe(false); // released via the leave path
    expect(roomA.state.hostUserId).toBe("user-v"); // host transferred
    expect(playerLeft.length).toBe(1);
    expect(u.closedReasons).toContain("SEAT_RELEASED");
  });

  it("the single-tab flow: a grace-held seat (navigated away) is released by joining another table", async () => {
    const tab1 = connect("user-u");
    await join(tab1, "CODEA");
    tab1.disconnect(); // navigate away — the seat is grace-held, room stays
    await sleep(100);
    expect(store.get("game-a")).toBeDefined();

    const tab2 = connect("user-u");
    await join(tab2, "CODEB");
    await sleep(100);
    expect(store.get("game-a")).toBeUndefined(); // released + emptied → closed
    expect(store.get("game-b")).toBeDefined();
  });

  it("rejoining the SAME room (reconnect) releases nothing", async () => {
    const tab1 = connect("user-u");
    await join(tab1, "CODEA");
    tab1.disconnect();
    await sleep(50);

    const tab2 = connect("user-u");
    const snap = await join(tab2, "CODEA");
    expect(snap.gameId).toBe("game-a");
    const roomA = store.get("game-a")!;
    expect(roomA.state.players.filter((p) => p.userId === "user-u")).toHaveLength(1);
    expect(roomA.state.players[0]!.connected).toBe(true);
    expect(tab2.closedReasons).toHaveLength(0);
  });
});
