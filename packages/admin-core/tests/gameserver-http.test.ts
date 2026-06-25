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
