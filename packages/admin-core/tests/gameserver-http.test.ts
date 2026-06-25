import { describe, expect, it, vi } from "vitest";
import { createHttpAdminGameServerClient, type LiveRoomDetail } from "../src/gameserver-http.js";

const sampleRooms: LiveRoomDetail[] = [
  {
    gameId: "g1",
    roomName: "R1",
    kind: "QUICK_PLAY",
    difficulty: "MEDIUM",
    phase: "FLOP",
    status: "IN_PROGRESS",
    maxPlayers: 6,
    handNumber: 3,
    dealerSeat: 0,
    currentTurnSeat: 1,
    seats: [
      { seat: 0, playerNumber: 100001, username: "A", status: "ACTIVE", connected: true, isBot: false, committedTotal: "100", available: "900" },
      { seat: 1, playerNumber: 900001, username: "Bot", status: "ACTIVE", connected: true, isBot: true, committedTotal: "50", available: "0" },
      { seat: 2, playerNumber: 100002, username: "C", status: "FOLDED", connected: false, isBot: false, committedTotal: "0", available: "1000" },
    ],
  },
];

function fakeFetch(ok: boolean, body: unknown) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 401, json: async () => body })) as unknown as typeof fetch;
}

describe("createHttpAdminGameServerClient", () => {
  it("listRoomsDetailed hits the admin endpoint and sends the internal token", async () => {
    const f = fakeFetch(true, { rooms: sampleRooms });
    const client = createHttpAdminGameServerClient({ baseUrl: "http://gs", token: "secret", fetchImpl: f });

    const rooms = await client.listRoomsDetailed();
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.seats).toHaveLength(3);

    const call = (f as unknown as { mock: { calls: [string, { headers: Record<string, string> }][] } }).mock.calls[0]!;
    expect(call[0]).toBe("http://gs/internal/admin/rooms");
    expect(call[1].headers["x-internal-token"]).toBe("secret");
  });

  it("listRooms derives summary counts (connected humans vs bots)", async () => {
    const f = fakeFetch(true, { rooms: sampleRooms });
    const client = createHttpAdminGameServerClient({ baseUrl: "http://gs", token: "s", fetchImpl: f });
    const summary = await client.listRooms();
    expect(summary[0]!).toMatchObject({ gameId: "g1", filled: 2, humans: 1, bots: 1, max: 6 });
  });

  it("throws on a non-ok response (e.g. 401 when the token is wrong)", async () => {
    const f = fakeFetch(false, {});
    const client = createHttpAdminGameServerClient({ baseUrl: "http://gs", fetchImpl: f });
    await expect(client.listRoomsDetailed()).rejects.toThrow(/401/);
  });
});

function callOf(f: unknown): [string, { method?: string }] {
  return (f as { mock: { calls: [string, { method?: string }][] } }).mock.calls[0]!;
}

describe("admin live controls (HTTP)", () => {
  it("getLive returns rooms + bots meta (defaults when bots absent)", async () => {
    const withBots = fakeFetch(true, { rooms: sampleRooms, bots: { enabled: true, paused: true, available: 5 } });
    const c1 = createHttpAdminGameServerClient({ baseUrl: "http://gs", token: "s", fetchImpl: withBots });
    const live = await c1.getLive();
    expect(live.rooms).toHaveLength(1);
    expect(live.bots).toEqual({ enabled: true, paused: true, available: 5 });

    const noBots = fakeFetch(true, { rooms: sampleRooms });
    const c2 = createHttpAdminGameServerClient({ baseUrl: "http://gs", token: "s", fetchImpl: noBots });
    expect((await c2.getLive()).bots).toEqual({ enabled: false, paused: false, available: 0 });
  });

  it("forceCloseRoom POSTs to /close with the gameId", async () => {
    const f = fakeFetch(true, { result: "closed" });
    const c = createHttpAdminGameServerClient({ baseUrl: "http://gs", token: "s", fetchImpl: f });
    expect(await c.forceCloseRoom("g1")).toBe("closed");
    const [url, init] = callOf(f);
    expect(url).toBe("http://gs/internal/admin/close?gameId=g1");
    expect(init.method).toBe("POST");
  });

  it("kickSeat POSTs to /kick with gameId + seat", async () => {
    const f = fakeFetch(true, { result: "kicked" });
    const c = createHttpAdminGameServerClient({ baseUrl: "http://gs", token: "s", fetchImpl: f });
    expect(await c.kickSeat("g1", 3)).toBe("kicked");
    const [url, init] = callOf(f);
    expect(url).toBe("http://gs/internal/admin/kick?gameId=g1&seat=3");
    expect(init.method).toBe("POST");
  });

  it("setBotsPaused POSTs to /bots and returns the meta", async () => {
    const f = fakeFetch(true, { enabled: true, paused: true, available: 5 });
    const c = createHttpAdminGameServerClient({ baseUrl: "http://gs", token: "s", fetchImpl: f });
    expect((await c.setBotsPaused(true)).paused).toBe(true);
    const [url, init] = callOf(f);
    expect(url).toBe("http://gs/internal/admin/bots?paused=true");
    expect(init.method).toBe("POST");
  });
});
