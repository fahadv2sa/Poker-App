import type { GameRoom } from "./room.js";

/**
 * Room registry. v1 keeps authoritative room state in memory on a single server
 * (Section 3). The interface is intentionally narrow so it can be swapped for a
 * Redis-backed implementation later without touching the orchestrator.
 */
export interface RoomStore {
  get(gameId: string): GameRoom | undefined;
  getByInvite(inviteCode: string): GameRoom | undefined;
  /** All live rooms (for the internal live-occupancy read used by the room list). */
  list(): GameRoom[];
  set(room: GameRoom): void;
  delete(gameId: string): void;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly byId = new Map<string, GameRoom>();
  private readonly byInvite = new Map<string, GameRoom>();

  get(gameId: string): GameRoom | undefined {
    return this.byId.get(gameId);
  }

  getByInvite(inviteCode: string): GameRoom | undefined {
    return this.byInvite.get(inviteCode);
  }

  list(): GameRoom[] {
    return [...this.byId.values()];
  }

  set(room: GameRoom): void {
    this.byId.set(room.state.gameId, room);
    this.byInvite.set(room.state.inviteCode, room);
  }

  delete(gameId: string): void {
    const room = this.byId.get(gameId);
    if (room) this.byInvite.delete(room.state.inviteCode);
    this.byId.delete(gameId);
  }
}
