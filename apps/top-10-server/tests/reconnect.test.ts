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
 * Reconnection integration test — drives the REAL socket handlers (auth stubbed) with a
 * socket.io-client, verifying that returning by any path resyncs the ongoing game
 * instead of duplicating it or stranding the player.
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

beforeEach(async () => {
  seq = 0;
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
  for (const r of matches.list()) {
    for (const s of r.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
    matches.removeRoom(r.id);
  }
  io.close();
  await new Promise<void>((res) => httpServer.close(() => res()));
});

const U = { userId: "u0", username: "A", playerNumber: 1 };
function client(user = U): ClientSocket {
  return ioc(`http://localhost:${port}`, { auth: { user }, transports: ["websocket"], forceNew: true });
}
function once<T>(s: ClientSocket, ev: string): Promise<T> {
  return new Promise((res) => s.once(ev, (p: T) => res(p)));
}

describe("Top Ten reconnection", () => {
  it("a dropped player returning resyncs their held seat (no duplicate room)", async () => {
    const c1 = client();
    await once(c1, "connect");
    const created = once<TtStateView>(c1, TT_SERVER_EVENTS.state);
    c1.emit(TT_CLIENT_EVENTS.create, { difficulty: "EASY" });
    await created;
    expect(matches.list().length).toBe(1);
    const roomId = matches.list()[0]!.id;

    c1.disconnect();
    await new Promise((r) => setTimeout(r, 40)); // let the server process the drop (seat held)

    const c2 = client();
    const resync = once<TtStateView>(c2, TT_SERVER_EVENTS.state); // connection handler resync
    await once(c2, "connect");
    const st = await resync;
    expect(st.matchId).toBe(roomId);
    expect(matches.list().length).toBe(1); // still ONE room
    expect(matches.get(roomId)!.seats.find((s) => s.userId === "u0")!.connected).toBe(true);
    c2.disconnect();
  });

  it("re-firing create on reconnect resyncs, never duplicates the room", async () => {
    const c = client();
    await once(c, "connect");
    const first = once<TtStateView>(c, TT_SERVER_EVENTS.state);
    c.emit(TT_CLIENT_EVENTS.create, { difficulty: "EASY" });
    await first;
    const id = matches.list()[0]!.id;

    const second = once<TtStateView>(c, TT_SERVER_EVENTS.state);
    c.emit(TT_CLIENT_EVENTS.create, { difficulty: "EASY" }); // the autoCreate re-fire on remount
    const st = await second;
    expect(st.matchId).toBe(id);
    expect(matches.list().length).toBe(1);
    c.disconnect();
  });

  it("re-queueing while already seated resyncs the room instead of queueing", async () => {
    const c = client();
    await once(c, "connect");
    const created = once<TtStateView>(c, TT_SERVER_EVENTS.state);
    c.emit(TT_CLIENT_EVENTS.create, { difficulty: "EASY" });
    await created;
    const id = matches.list()[0]!.id;

    const resync = once<TtStateView>(c, TT_SERVER_EVENTS.state);
    c.emit(TT_CLIENT_EVENTS.queueJoin, { difficulty: "EASY" }); // client re-asserts queue on reconnect
    const st = await resync;
    expect(st.matchId).toBe(id); // resynced into the room, not put in a queue
    c.disconnect();
  });
});
