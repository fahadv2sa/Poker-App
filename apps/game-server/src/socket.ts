import { getWalletBalance, prisma } from "@fp/db";
import type { Action, HandRankDef } from "@fp/engine";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  actionPlaceSchema,
  claimSelectSchema,
  roomJoinSchema,
  type StateSyncPayload,
} from "@fp/shared";
import type { Server, Socket } from "socket.io";
import { GameRoom, type RoomDeps } from "./room.js";
import type { Emitter } from "./ports.js";
import { hydrateRoom } from "./factory.js";
import { PrismaCardSource } from "./cards.js";
import { PrismaRoomPersistence } from "./persistence.js";
import { NodeTimerService, systemClock } from "./timers.js";
import type { RoomStore } from "./store.js";
import type { RoomPlayer, RoomState } from "./types.js";

const roomKey = (gameId: string) => `game:${gameId}`;

/** Emits to a Socket.IO room and to individual seats (private hole cards). */
class SocketEmitter implements Emitter {
  constructor(
    private readonly io: Server,
    private readonly gameId: string,
    private readonly seats: Map<number, string>,
  ) {}

  toRoom(event: string, payload: unknown): void {
    this.io.to(roomKey(this.gameId)).emit(event, payload);
  }

  toSeat(seat: number, event: string, payload: unknown): void {
    const sid = this.seats.get(seat);
    if (sid) this.io.to(sid).emit(event, payload);
  }
}

interface RoomRuntime {
  room: GameRoom;
  /** seat → connected socket id, for private emits. */
  seats: Map<number, string>;
}

/** Identity attached to a socket (set during authentication). */
interface SocketUser {
  userId: string;
  username: string;
  playerNumber: number;
}

/**
 * Wire the authoritative Socket.IO handlers (Section 12). Every client input is
 * validated with the shared Zod schemas; the server is the only referee. Hole
 * cards are emitted only to their owner — never in the broadcast state:sync.
 *
 * Auth note: in production the handshake must carry a verified Auth.js session
 * (httpOnly cookie, Section 16). Here we read the authenticated identity from
 * `socket.data.user`, set by an upstream auth middleware.
 */
export function attachSocketHandlers(
  io: Server,
  store: RoomStore,
  ranks: HandRankDef[],
): void {
  const runtimes = new Map<string, RoomRuntime>();

  const buildDeps = (gameId: string, seats: Map<number, string>): RoomDeps => ({
    cards: new PrismaCardSource(),
    persistence: new PrismaRoomPersistence(),
    emitter: new SocketEmitter(io, gameId, seats),
    timers: new NodeTimerService(),
    clock: systemClock,
  });

  async function getRuntime(gameId: string): Promise<RoomRuntime | null> {
    const existing = store.get(gameId);
    if (existing) {
      const rt = runtimes.get(gameId);
      if (rt) return rt;
    }
    const state = await hydrateRoom(gameId, ranks);
    if (!state) return null;
    const seats = new Map<number, string>();
    const room = new GameRoom(state, buildDeps(gameId, seats));
    const rt: RoomRuntime = { room, seats };
    store.set(room);
    runtimes.set(gameId, rt);
    return rt;
  }

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser | undefined;
    if (!user) {
      emitError(socket, "UNAUTHENTICATED", "الجلسة غير صالحة");
      socket.disconnect(true);
      return;
    }

    let joinedGameId: string | null = null;

    socket.on(CLIENT_EVENTS.roomJoin, (raw: unknown) =>
      guard(socket, async () => {
        const input = roomJoinSchema.parse(raw);
        const game = await prisma.game.findUnique({
          where: { inviteCode: input.inviteCode },
          select: { id: true },
        });
        if (!game) return emitError(socket, "ROOM_NOT_FOUND", "الغرفة غير موجودة");
        const rt = await getRuntime(game.id);
        if (!rt) return emitError(socket, "ROOM_NOT_FOUND", "الغرفة غير موجودة");

        // FIX #2: seat the player with their real wallet balance as `available`.
        const balance = await getWalletBalance(user.userId);
        const player = seatPlayer(rt.room.state, user, balance);
        rt.seats.set(player.seat, socket.id);
        joinedGameId = game.id;
        await socket.join(roomKey(game.id));

        socket.emit(SERVER_EVENTS.stateSync, buildStateSync(rt.room.state, player.seat));
        socket
          .to(roomKey(game.id))
          .emit(SERVER_EVENTS.stateSync, buildStateSync(rt.room.state, null));

        // FIX #4: a mid-hand reconnect privately re-receives its own hole cards
        // (seats map was just rebound above, so this reaches the new socket).
        rt.room.resyncSeat(player.seat);
      }),
    );

    socket.on(CLIENT_EVENTS.gameStart, () =>
      guard(socket, async () => {
        const rt = joinedGameId ? runtimes.get(joinedGameId) : undefined;
        if (!rt) return emitError(socket, "NO_ROOM", "لست في غرفة");
        if (rt.room.state.createdBy !== user.userId) {
          return emitError(socket, "NOT_HOST", "المضيف فقط يبدأ اللعبة");
        }
        await rt.room.start();
      }),
    );

    socket.on(CLIENT_EVENTS.actionPlace, (raw: unknown) =>
      guard(socket, async () => {
        const input = actionPlaceSchema.parse(raw);
        const rt = joinedGameId ? runtimes.get(joinedGameId) : undefined;
        if (!rt) return emitError(socket, "NO_ROOM", "لست في غرفة");
        const seat = seatOf(rt, socket.id);
        if (seat === null) return emitError(socket, "NO_SEAT", "لا مقعد لك");
        const action: Action = {
          type: input.type as Action["type"],
          amount: input.amount !== undefined ? BigInt(input.amount) : undefined,
        };
        await rt.room.placeAction(seat, action);
      }),
    );

    socket.on(CLIENT_EVENTS.claimSelect, (raw: unknown) =>
      guard(socket, async () => {
        const input = claimSelectSchema.parse(raw);
        const rt = joinedGameId ? runtimes.get(joinedGameId) : undefined;
        if (!rt) return emitError(socket, "NO_ROOM", "لست في غرفة");
        const seat = seatOf(rt, socket.id);
        if (seat === null) return emitError(socket, "NO_SEAT", "لا مقعد لك");
        await rt.room.selectClaim(seat, input.handRankId);
      }),
    );

    const leave = () => {
      if (!joinedGameId) return;
      const rt = runtimes.get(joinedGameId);
      if (!rt) return;
      const seat = seatOf(rt, socket.id);
      if (seat !== null) {
        rt.seats.delete(seat);
        const p = rt.room.state.players.find((x) => x.seat === seat);
        if (p) p.connected = false;
      }
    };
    socket.on(CLIENT_EVENTS.roomLeave, leave);
    socket.on("disconnect", leave);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seatOf(rt: RoomRuntime, socketId: string): number | null {
  for (const [seat, sid] of rt.seats) if (sid === socketId) return seat;
  return null;
}

/**
 * Seat an existing player (rejoin) or add a new one to a LOBBY room. `available`
 * is the joining user's real wallet balance (re-confirmed from the ledger at
 * hand start); a rejoin keeps its in-progress betting state.
 */
function seatPlayer(state: RoomState, user: SocketUser, available: bigint): RoomPlayer {
  const existing = state.players.find((p) => p.userId === user.userId);
  if (existing) {
    existing.connected = true;
    return existing;
  }
  if (state.status !== "LOBBY") throw new Error("Game already started");
  if (state.players.length >= state.maxPlayers) throw new Error("Room is full");
  const used = new Set(state.players.map((p) => p.seat));
  let seat = 1;
  while (used.has(seat)) seat++;
  const player: RoomPlayer = {
    seat,
    userId: user.userId,
    username: user.username,
    playerNumber: user.playerNumber,
    status: "WAITING",
    available, // real wallet balance; reconfirmed at start
    committedThisRound: 0n,
    committedTotal: 0n,
    lastBetAmount: 0n,
    hasActed: false,
    forfeit: 0n,
    holeCards: [],
    claimRankId: null,
    claimValid: false,
    claimStrength: 0,
    connected: true,
  };
  state.players.push(player);
  return player;
}

/** Sanitized snapshot — NEVER includes hole cards (Section 16). */
function buildStateSync(state: RoomState, yourSeat: number | null): StateSyncPayload {
  return {
    gameId: state.gameId,
    roomName: state.roomName,
    phase: state.phase,
    status: state.status,
    players: state.players.map((p) => ({
      seat: p.seat,
      username: p.username,
      playerNumber: p.playerNumber,
      status: p.status,
      committedThisRound: Number(p.committedThisRound),
      committedTotal: Number(p.committedTotal),
      isDealer: state.dealerSeat === p.seat,
    })),
    communityCards: state.community.slice(0, state.communityRevealed).map((c) => ({
      playerId: c.playerId,
      name: c.name,
      nationality: c.nationality,
      position: c.position,
      clubs: [...c.clubs],
      photoUrl: c.photoUrl,
    })),
    pot: Number(state.players.reduce((s, p) => s + p.committedTotal, 0n)),
    currentBet: Number(state.currentBet),
    dealerSeat: state.dealerSeat,
    currentTurnSeat: state.currentTurnSeat,
    turnDeadlineTs: state.turnDeadlineTs,
    yourSeat,
  };
}

function emitError(socket: Socket, code: string, messageAr: string): void {
  socket.emit(SERVER_EVENTS.error, { code, messageAr });
}

/** Run an async handler, surfacing any throw as a localized error event. */
async function guard(socket: Socket, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const messageAr = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    emitError(socket, "ACTION_FAILED", messageAr);
  }
}
