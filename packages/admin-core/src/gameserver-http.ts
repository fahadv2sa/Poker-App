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

export interface DetailedAdminGameServerClient extends AdminGameServerClient {
  listRoomsDetailed(): Promise<LiveRoomDetail[]>;
}

/**
 * HTTP implementation of the game-server admin boundary. Talks ONLY over HTTP to
 * the authenticated `/internal/admin/rooms` endpoint — the same transport whether
 * the caller is the web app (Phase 2) or a standalone dashboard (P3). Read-only.
 */
export function createHttpAdminGameServerClient(
  opts: HttpAdminGameServerClientOptions,
): DetailedAdminGameServerClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (opts.token) headers["x-internal-token"] = opts.token;

  async function listRoomsDetailed(): Promise<LiveRoomDetail[]> {
    // No `cache` option here: this stays framework-agnostic (Node's RequestInit).
    // Freshness is the caller's concern — the web live page is `force-dynamic`.
    const res = await doFetch(`${opts.baseUrl}/internal/admin/rooms`, { headers });
    if (!res.ok) throw new Error(`game-server /internal/admin/rooms -> ${res.status}`);
    const data = (await res.json()) as { rooms?: LiveRoomDetail[] };
    return data.rooms ?? [];
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

  return { listRooms, listRoomsDetailed };
}
