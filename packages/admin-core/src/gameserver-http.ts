import type { AdminGameServerClient, LiveRoomSummary } from "./gameserver-client.js";

/** A live seat as exposed by the game-server admin endpoint (BigInts stringified). */
export interface LiveSeat {
  seat: number;
  playerNumber: number;
  username: string;
  status: string;
  connected: boolean;
  isBot: boolean;
  committedTotal: string;
  available: string;
}

export interface LiveRoomDetail {
  gameId: string;
  roomName: string;
  kind: string;
  difficulty: string | null;
  phase: string;
  status: string;
  maxPlayers: number;
  handNumber: number;
  dealerSeat: number | null;
  currentTurnSeat: number | null;
  seats: LiveSeat[];
}

export interface HttpAdminGameServerClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

/** Bot runtime status reported alongside the live rooms. */
export interface LiveBotsMeta {
  enabled: boolean;
  paused: boolean;
  available: number;
}

export interface LiveState {
  rooms: LiveRoomDetail[];
  bots: LiveBotsMeta;
}

export interface DetailedAdminGameServerClient extends AdminGameServerClient {
  listRoomsDetailed(): Promise<LiveRoomDetail[]>;
  /** Full live snapshot: rooms + bot status. */
  getLive(): Promise<LiveState>;
  /** Force-close a live table (refund-through-ledger + teardown). */
  forceCloseRoom(gameId: string): Promise<string>;
  /** Remove one seat from a live table. */
  kickSeat(gameId: string, seat: number): Promise<string>;
  /** Pause/resume cold-start bot fills at runtime. */
  setBotsPaused(paused: boolean): Promise<LiveBotsMeta>;
}

/**
 * HTTP implementation of the game-server admin boundary. Talks ONLY over HTTP to
 * the authenticated `/internal/admin/*` endpoints — the same transport whether
 * the caller is the web app (Phase 2/4) or a standalone dashboard (P3). The
 * audit/authorization is the WEB caller's job; this is the executor.
 */
export function createHttpAdminGameServerClient(
  opts: HttpAdminGameServerClientOptions,
): DetailedAdminGameServerClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (opts.token) headers["x-internal-token"] = opts.token;

  // No `cache` option anywhere: stays framework-agnostic (Node's RequestInit).
  // Freshness is the caller's concern — the web live page is `force-dynamic`.
  async function call(pathAndQuery: string, method: "GET" | "POST" = "GET"): Promise<unknown> {
    const res = await doFetch(`${opts.baseUrl}${pathAndQuery}`, { headers, method });
    if (!res.ok) throw new Error(`game-server ${pathAndQuery} -> ${res.status}`);
    return res.json();
  }

  async function getLive(): Promise<LiveState> {
    const data = (await call("/internal/admin/rooms")) as {
      rooms?: LiveRoomDetail[];
      bots?: LiveBotsMeta;
    };
    return {
      rooms: data.rooms ?? [],
      bots: data.bots ?? { enabled: false, paused: false, available: 0 },
    };
  }

  async function listRoomsDetailed(): Promise<LiveRoomDetail[]> {
    return (await getLive()).rooms;
  }

  async function listRooms(): Promise<LiveRoomSummary[]> {
    const rooms = await listRoomsDetailed();
    return rooms.map((r) => {
      const connected = r.seats.filter((s) => s.connected);
      const bots = connected.filter((s) => s.isBot).length;
      return {
        gameId: r.gameId,
        filled: connected.length,
        max: r.maxPlayers,
        bots,
        humans: connected.length - bots,
        phase: r.phase,
        status: r.status,
      };
    });
  }

  async function forceCloseRoom(gameId: string): Promise<string> {
    const data = (await call(
      `/internal/admin/close?gameId=${encodeURIComponent(gameId)}`,
      "POST",
    )) as { result?: string };
    return data.result ?? "unknown";
  }

  async function kickSeat(gameId: string, seat: number): Promise<string> {
    const data = (await call(
      `/internal/admin/kick?gameId=${encodeURIComponent(gameId)}&seat=${seat}`,
      "POST",
    )) as { result?: string };
    return data.result ?? "unknown";
  }

  async function setBotsPaused(paused: boolean): Promise<LiveBotsMeta> {
    return (await call(`/internal/admin/bots?paused=${paused}`, "POST")) as LiveBotsMeta;
  }

  return { listRooms, listRoomsDetailed, getLive, forceCloseRoom, kickSeat, setBotsPaused };
}
