/**
 * Boundary to the authoritative game-server for live-runtime admin actions.
 *
 * Phase 0 defines the SHAPE only. Implementations land later and talk over the
 * existing internal HTTP channel (the `INTERNAL_API_TOKEN`-gated endpoint on the
 * game-server) — never via in-process calls:
 *   - Phase 2: `listRooms` (read-only inspect of live tables).
 *   - Phase 4: force-close (routes through the ledger refund path) + kick seat.
 *
 * Keeping admin ↔ game-server strictly over HTTP is exactly what lets the
 * dashboard move out to its own service (Proposal 3) with no rewrite: the
 * transport is identical whether the caller is the web app or a standalone
 * admin service.
 */

export interface LiveRoomSummary {
  gameId: string;
  filled: number;
  max: number;
  bots: number;
  humans: number;
  phase: string;
  status: string;
}

export interface AdminGameServerClient {
  /** Live room/seat inspection (Phase 2). */
  listRooms(): Promise<LiveRoomSummary[]>;

  // Reserved for Phase 4 (control); shapes added when implemented:
  // forceCloseRoom(gameId: string): Promise<void>;
  // kickSeat(gameId: string, seat: number): Promise<void>;
}
