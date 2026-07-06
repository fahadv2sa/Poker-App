import type { Server, Socket } from "socket.io";
import {
  GP_CLIENT_EVENTS,
  GP_SERVER_EVENTS,
  GP_TIMING,
  gpAskSchema,
  gpCreateSchema,
  gpGuessSchema,
  gpJoinSchema,
  gpPickSchema,
  gpQueueJoinSchema,
  type GpDifficulty,
  type RealtimeClaims,
} from "@fb/shared";
import type { GpMatches } from "./match.js";
import type { GpMatchRoom } from "./types.js";

interface QueuedPlayer extends RealtimeClaims {
  socketId: string;
}

/**
 * Socket layer (mirrors top-10-server): validates every input with Zod,
 * resolves the caller's room by their verified userId, and delegates to the
 * orchestrator. Quick-play queues per difficulty with an 8s gather window;
 * per the approved decision there are NO bots — after the window the match
 * starts with whoever queued, INCLUDING a single player (solo VS_SYSTEM).
 */
export function attachSocketHandlers(io: Server, matches: GpMatches): void {
  const queues = new Map<GpDifficulty, Map<string, QueuedPlayer>>();
  const fillTimers = new Map<GpDifficulty, ReturnType<typeof setTimeout>>();

  const user = (socket: Socket): RealtimeClaims => socket.data.user as RealtimeClaims;
  const findRoomOf = (userId: string): GpMatchRoom | undefined =>
    matches
      .list()
      .find(
        (r) =>
          r.seats.some((s) => s.userId === userId) &&
          r.status !== "ENDED" &&
          r.status !== "ABANDONED",
      );
  const findActiveOrEnded = (userId: string): GpMatchRoom | undefined =>
    matches
      .list()
      .find((r) => r.seats.some((s) => s.userId === userId) && r.status !== "ABANDONED");

  /** Re-attach a (re)connecting socket to a held seat (cancel grace, mark
   *  connected, rejoin the socket room, push a snapshot). */
  const resyncTo = (socket: Socket, room: GpMatchRoom): void => {
    const uid = user(socket).userId;
    const seat = room.seats.find((s) => s.userId === uid);
    if (seat) {
      if (seat.graceTimer) {
        clearTimeout(seat.graceTimer);
        seat.graceTimer = undefined;
      }
      seat.connected = true;
      seat.away = false;
      seat.socketId = socket.id;
    }
    socket.join(room.id);
    matches.sync(room);
  };

  function broadcastQueue(difficulty: GpDifficulty): void {
    const q = queues.get(difficulty);
    if (!q) return;
    for (const p of q.values()) {
      io.to(p.socketId).emit(GP_SERVER_EVENTS.queueState, {
        difficulty,
        waiting: q.size,
        needed: 1, // solo is allowed — the window just gathers more players
        countdownSec: fillTimers.has(difficulty) ? GP_TIMING.fillWindowSec : null,
      });
    }
  }

  function startFillTimer(difficulty: GpDifficulty): void {
    if (fillTimers.has(difficulty)) return;
    const t = setTimeout(() => {
      fillTimers.delete(difficulty);
      flushQueue(difficulty);
    }, GP_TIMING.fillWindowSec * 1000);
    fillTimers.set(difficulty, t);
    broadcastQueue(difficulty);
  }

  function flushQueue(difficulty: GpDifficulty): void {
    const q = queues.get(difficulty);
    if (!q || q.size === 0) return;
    const players = [...q.values()].slice(0, 4);
    for (const p of players) q.delete(p.socketId);
    const room = matches.createQuickPlay(difficulty);
    for (const p of players) {
      matches.addSeat(room, p);
      const s = io.sockets.sockets.get(p.socketId);
      s?.join(room.id);
      const seat = room.seats.find((x) => x.userId === p.userId);
      if (seat) seat.socketId = p.socketId;
      io.to(p.socketId).emit(GP_SERVER_EVENTS.queueMatched, { matchId: room.id });
    }
    matches.sync(room);
    matches.start(room, room.seats[0]!.userId, true); // allowSolo
    broadcastQueue(difficulty);
  }

  function ensureQueue(difficulty: GpDifficulty): Map<string, QueuedPlayer> {
    let q = queues.get(difficulty);
    if (!q) {
      q = new Map();
      queues.set(difficulty, q);
    }
    return q;
  }

  function leaveAllQueues(socketId: string): void {
    for (const [difficulty, q] of queues) {
      if (q.delete(socketId)) {
        if (q.size === 0) {
          const t = fillTimers.get(difficulty);
          if (t) {
            clearTimeout(t);
            fillTimers.delete(difficulty);
          }
        }
        broadcastQueue(difficulty);
      }
    }
  }

  io.on("connection", (socket) => {
    const u = user(socket);

    const existing = findActiveOrEnded(u.userId);
    if (existing) resyncTo(socket, existing);

    socket.on(GP_CLIENT_EVENTS.create, (raw, ack?: (r: unknown) => void) => {
      const parsed = gpCreateSchema.safeParse(raw);
      if (!parsed.success) return ack?.({ error: "INVALID" });
      const current = findActiveOrEnded(u.userId);
      if (current) {
        resyncTo(socket, current);
        return ack?.({ matchId: current.id, inviteCode: current.inviteCode });
      }
      const room = matches.createManual(u, {
        mode: parsed.data.mode,
        difficulty: parsed.data.difficulty,
        roundsTotal: parsed.data.roundsTotal,
        roomName: parsed.data.roomName ?? null,
        maxPlayers: parsed.data.maxPlayers,
        isPrivate: parsed.data.isPrivate,
      });
      const seat = room.seats[0]!;
      seat.socketId = socket.id;
      socket.join(room.id);
      matches.sync(room);
      ack?.({ matchId: room.id, inviteCode: room.inviteCode });
    });

    socket.on(GP_CLIENT_EVENTS.join, (raw, ack?: (r: unknown) => void) => {
      const parsed = gpJoinSchema.safeParse(raw);
      if (!parsed.success) return ack?.({ error: "INVALID" });
      const current = findActiveOrEnded(u.userId);
      if (current) {
        resyncTo(socket, current);
        return ack?.({ matchId: current.id });
      }
      const room = matches
        .list()
        .find((r) => r.inviteCode === parsed.data.inviteCode && r.status === "LOBBY");
      if (!room) return ack?.({ error: "NOT_FOUND" });
      const seat = matches.addSeat(room, u);
      if (!seat) return ack?.({ error: "FULL" });
      seat.socketId = socket.id;
      socket.join(room.id);
      matches.sync(room);
      ack?.({ matchId: room.id });
    });

    socket.on(GP_CLIENT_EVENTS.start, () => {
      const room = findRoomOf(u.userId);
      if (room) matches.start(room, u.userId);
    });

    socket.on(GP_CLIENT_EVENTS.pick, (raw) => {
      const parsed = gpPickSchema.safeParse(raw);
      if (!parsed.success) return;
      const room = findRoomOf(u.userId);
      if (room) void matches.pick(room, u.userId, parsed.data.playerId);
    });

    socket.on(GP_CLIENT_EVENTS.ask, (raw) => {
      const parsed = gpAskSchema.safeParse(raw);
      if (!parsed.success) return;
      const room = findRoomOf(u.userId);
      if (room) void matches.ask(room, u.userId, parsed.data);
    });

    socket.on(GP_CLIENT_EVENTS.guess, (raw) => {
      const parsed = gpGuessSchema.safeParse(raw);
      if (!parsed.success) return;
      const room = findRoomOf(u.userId);
      if (room) void matches.guess(room, u.userId, parsed.data.playerId);
    });

    socket.on(GP_CLIENT_EVENTS.newMatch, () => {
      const room = findActiveOrEnded(u.userId);
      if (room) matches.requestNewMatch(room, u.userId);
    });

    socket.on(GP_CLIENT_EVENTS.queueJoin, (raw) => {
      const parsed = gpQueueJoinSchema.safeParse(raw);
      if (!parsed.success) return;
      const current = findActiveOrEnded(u.userId);
      if (current) {
        resyncTo(socket, current);
        return;
      }
      leaveAllQueues(socket.id);
      ensureQueue(parsed.data.difficulty).set(socket.id, { ...u, socketId: socket.id });
      startFillTimer(parsed.data.difficulty);
      broadcastQueue(parsed.data.difficulty);
    });

    socket.on(GP_CLIENT_EVENTS.away, () => {
      const room = findRoomOf(u.userId);
      if (room) matches.setAway(room, u.userId, true);
    });
    socket.on(GP_CLIENT_EVENTS.back, () => {
      const room = findRoomOf(u.userId);
      if (room) matches.setAway(room, u.userId, false);
    });

    socket.on(GP_CLIENT_EVENTS.queueLeave, () => leaveAllQueues(socket.id));

    socket.on(GP_CLIENT_EVENTS.close, () => {
      const room = findActiveOrEnded(u.userId);
      if (room) {
        matches.closeRoom(room, u.userId);
        socket.leave(room.id);
      }
    });

    socket.on(GP_CLIENT_EVENTS.leave, () => {
      leaveAllQueues(socket.id);
      const room = findActiveOrEnded(u.userId);
      if (room) {
        matches.withdraw(room, u.userId);
        socket.leave(room.id);
      }
    });

    socket.on("disconnect", () => {
      leaveAllQueues(socket.id);
      const room = findActiveOrEnded(u.userId);
      if (!room) return;
      const seat = room.seats.find((s) => s.userId === u.userId);
      if (!seat) return;
      seat.connected = false;
      if (room.status === "ENDED") {
        matches.sync(room);
        return;
      }
      // Hold the seat for the reconnect grace (LOBBY included — a creator
      // sharing the invite link must not lose the room).
      seat.graceTimer = setTimeout(() => {
        const r = matches.get(room.id);
        if (r) matches.withdraw(r, u.userId);
      }, GP_TIMING.reconnectGraceMs);
      matches.sync(room);
    });
  });
}
