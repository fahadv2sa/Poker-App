import type { Server, Socket } from "socket.io";
import {
  TT_BOTS,
  TT_CLIENT_EVENTS,
  TT_MIN_PLAYERS,
  TT_SERVER_EVENTS,
  TT_TIMING,
  ttCreateSchema,
  ttGuessSchema,
  ttJoinSchema,
  ttEndRoundVoteSchema,
  ttQueueJoinSchema,
  type RealtimeClaims,
  type TtDifficulty,
} from "@fb/shared";
import type { Matches } from "./match.js";
import type { MatchRoom } from "./types.js";

export interface BotFiller {
  /** Fill a quick-play room with bots up to a randomized target in [2,4]. */
  fillQuickPlay(matches: Matches, room: MatchRoom): void;
}

interface QueuedPlayer extends RealtimeClaims {
  socketId: string;
}

export function attachSocketHandlers(io: Server, matches: Matches, botFiller?: BotFiller): void {
  // quick-play queues, one per difficulty
  const queues = new Map<TtDifficulty, Map<string, QueuedPlayer>>();
  const fillTimers = new Map<TtDifficulty, ReturnType<typeof setTimeout>>();

  const user = (socket: Socket): RealtimeClaims => socket.data.user as RealtimeClaims;
  // Only an ACTIVE seat counts as "in a room": a mid-match withdrawal keeps the seat
  // object around (status WITHDRAWN) for the standings, but the player no longer holds
  // it — matching it here would shadow any room they create/join afterwards and resync
  // them into a table they already left.
  const holdsSeat = (r: MatchRoom, userId: string): boolean =>
    r.seats.some((s) => s.userId === userId && s.status === "ACTIVE");
  const findRoomOf = (userId: string): MatchRoom | undefined =>
    matches.list().find((r) => holdsSeat(r, userId) && r.status !== "ENDED" && r.status !== "ABANDONED");
  // Includes a just-ENDED room so the post-round New-Round window (ready vote / leave /
  // reconnect) can still find it; an ABANDONED room is torn down and never matched.
  const findActiveOrEnded = (userId: string): MatchRoom | undefined =>
    matches.list().find((r) => holdsSeat(r, userId) && r.status !== "ABANDONED");

  /** Re-attach a (re)connecting socket to a room the user already holds a seat in:
   *  cancel any leave-grace, mark connected, re-join the socket room, and push a fresh
   *  snapshot. Used by the connection handler AND by create/join/queueJoin so that
   *  returning by ANY path resyncs the ongoing game instead of duplicating it or
   *  stranding the player (the core reconnection fix). */
  const resyncTo = (socket: Socket, room: MatchRoom): void => {
    const uid = user(socket).userId;
    const seat = room.seats.find((s) => s.userId === uid);
    if (seat) {
      if (seat.graceTimer) {
        clearTimeout(seat.graceTimer);
        seat.graceTimer = undefined;
      }
      seat.connected = true;
      seat.away = false; // reconnecting = back at the table; clear any stale away badge
      seat.socketId = socket.id;
    }
    socket.join(room.id);
    matches.sync(room);
  };

  function broadcastQueue(difficulty: TtDifficulty): void {
    const q = queues.get(difficulty);
    if (!q) return;
    const waiting = q.size;
    const countdown = fillTimers.has(difficulty) ? TT_BOTS.fillWindowSec : null;
    for (const p of q.values()) {
      io.to(p.socketId).emit(TT_SERVER_EVENTS.queueState, {
        difficulty,
        waiting,
        needed: TT_MIN_PLAYERS,
        countdownSec: countdown,
      });
    }
  }

  function startFillTimer(difficulty: TtDifficulty): void {
    if (fillTimers.has(difficulty)) return;
    const t = setTimeout(() => {
      fillTimers.delete(difficulty);
      flushQueue(difficulty);
    }, TT_BOTS.fillWindowSec * 1000);
    fillTimers.set(difficulty, t);
    broadcastQueue(difficulty);
  }

  function flushQueue(difficulty: TtDifficulty): void {
    const q = queues.get(difficulty);
    if (!q || q.size === 0) return;
    const players = [...q.values()].slice(0, 4);
    // need at least the minimum of humans, OR bots to fill the gap
    if (players.length < TT_MIN_PLAYERS && !botFiller) {
      // not enough and no bots — keep waiting
      return;
    }
    for (const p of players) q.delete(p.socketId);
    const room = matches.createQuickPlay(difficulty);
    for (const p of players) {
      matches.addSeat(room, p, false);
      const s = io.sockets.sockets.get(p.socketId);
      s?.join(room.id);
      io.to(p.socketId).emit(TT_SERVER_EVENTS.queueMatched, { matchId: room.id });
    }
    botFiller?.fillQuickPlay(matches, room);
    if (room.seats.length < TT_MIN_PLAYERS) {
      // still short and no bots filled — disband, requeue the humans
      for (const p of players) {
        ensureQueue(difficulty).set(p.socketId, p);
        io.to(p.socketId).emit(TT_SERVER_EVENTS.toast, { text: "بانتظار لاعبين آخرين…" });
      }
      matches.removeRoom(room.id);
      return;
    }
    matches.sync(room);
    matches.start(room, room.seats[0]!.userId);
    broadcastQueue(difficulty);
  }

  function ensureQueue(difficulty: TtDifficulty): Map<string, QueuedPlayer> {
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

    // reconnect: if the player has a held seat, cancel its grace and resync (also
    // re-attaches to a just-ENDED room so they see the winner screen + new-round vote)
    const existing = findActiveOrEnded(u.userId);
    if (existing) resyncTo(socket, existing);

    socket.on(TT_CLIENT_EVENTS.create, (raw, ack?: (r: unknown) => void) => {
      const parsed = ttCreateSchema.safeParse(raw);
      if (!parsed.success) return ack?.({ error: "INVALID" });
      const current = findActiveOrEnded(u.userId);
      if (current) {
        // Reload of the SAME /play?create=1&n=… URL (or a nonce-less deep
        // link) → reconnect-safe resync, never a duplicate room. A create
        // with a NEW nonce is a deliberate fresh create: the user is done
        // with whatever seat is still grace-held for them (e.g. an old
        // quick-play table) — withdraw it (normal teardown rules apply)
        // and open the fresh lobby. THE BUG this fixes: create used to
        // resync unconditionally, dropping the creator into their old
        // LIVE table instead of a waiting lobby.
        const sameCreate =
          !parsed.data.nonce || (current.createNonce != null && current.createNonce === parsed.data.nonce);
        if (sameCreate) {
          resyncTo(socket, current);
          return ack?.({ matchId: current.id, inviteCode: current.inviteCode });
        }
        socket.leave(current.id); // stop old-room events first (withdraw may emit teardown)
        matches.withdraw(current, u.userId);
      }
      const room = matches.createManual(
        u,
        parsed.data.difficulty,
        parsed.data.roundTimerSec ?? TT_TIMING.defaultRoundSec,
        parsed.data.isPrivate ?? false,
        parsed.data.roomName ?? null,
        parsed.data.maxPlayers,
        parsed.data.nonce ?? null,
      );
      const seat = room.seats[0]!;
      seat.socketId = socket.id;
      socket.join(room.id);
      matches.sync(room);
      ack?.({ matchId: room.id, inviteCode: room.inviteCode });
    });

    socket.on(TT_CLIENT_EVENTS.join, (raw, ack?: (r: unknown) => void) => {
      const parsed = ttJoinSchema.safeParse(raw);
      if (!parsed.success) return ack?.({ error: "INVALID" });
      const current = findActiveOrEnded(u.userId);
      if (current) {
        // Same room (invite-link reload / returning member) → resync into it —
        // works in ANY non-abandoned state, so a member returning after the
        // room started still lands back inside.
        if (current.inviteCode === parsed.data.inviteCode) {
          resyncTo(socket, current);
          return ack?.({ matchId: current.id });
        }
        // A DIFFERENT room's invite is a deliberate move: release the stale
        // seat first so the join lands in the target LOBBY, never back in an
        // old table.
        socket.leave(current.id); // stop old-room events first (withdraw may emit teardown)
        matches.withdraw(current, u.userId);
      }
      const room = matches.list().find((r) => r.inviteCode === parsed.data.inviteCode && r.status === "LOBBY");
      if (!room) return ack?.({ error: "NOT_FOUND" });
      const seat = matches.addSeat(room, u, false);
      if (!seat) return ack?.({ error: "FULL" });
      seat.socketId = socket.id;
      socket.join(room.id);
      matches.sync(room);
      ack?.({ matchId: room.id });
    });

    socket.on(TT_CLIENT_EVENTS.start, () => {
      const room = findRoomOf(u.userId);
      if (room) matches.start(room, u.userId);
    });

    socket.on(TT_CLIENT_EVENTS.guess, (raw) => {
      const parsed = ttGuessSchema.safeParse(raw);
      if (!parsed.success) return;
      const room = findRoomOf(u.userId);
      if (!room) return;
      const seat = room.seats.find((s) => s.userId === u.userId);
      if (seat) matches.guess(room, seat.seat, parsed.data.playerId);
    });

    socket.on(TT_CLIENT_EVENTS.endRoundRequest, () => {
      const room = findRoomOf(u.userId);
      const seat = room?.seats.find((s) => s.userId === u.userId);
      if (room && seat) matches.requestEndRound(room, seat.seat);
    });

    socket.on(TT_CLIENT_EVENTS.endRoundVote, (raw) => {
      const parsed = ttEndRoundVoteSchema.safeParse(raw);
      if (!parsed.success) return;
      const room = findRoomOf(u.userId);
      const seat = room?.seats.find((s) => s.userId === u.userId);
      if (room && seat) matches.voteEndRound(room, seat.seat, parsed.data.accept);
    });

    socket.on(TT_CLIENT_EVENTS.newRound, () => {
      const room = findActiveOrEnded(u.userId);
      const seat = room?.seats.find((s) => s.userId === u.userId);
      if (room && seat) matches.requestNewRound(room, seat.seat);
    });

    socket.on(TT_CLIENT_EVENTS.queueJoin, (raw) => {
      const parsed = ttQueueJoinSchema.safeParse(raw);
      if (!parsed.success) return;
      // Reconnect-safe: if the player is already in a live room (e.g. they were matched
      // while away and the client re-asserts the queue on reconnect), resync that room
      // instead of putting them back in a queue.
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

    socket.on(TT_CLIENT_EVENTS.away, () => {
      const room = findRoomOf(u.userId);
      if (room) matches.setAway(room, u.userId, true);
    });
    socket.on(TT_CLIENT_EVENTS.back, () => {
      const room = findRoomOf(u.userId);
      if (room) matches.setAway(room, u.userId, false);
    });

    socket.on(TT_CLIENT_EVENTS.queueLeave, () => leaveAllQueues(socket.id));

    socket.on(TT_CLIENT_EVENTS.close, () => {
      // The creator's close button lives on the winner screen (status ENDED), so this
      // must find a just-ENDED room too — findRoomOf excludes ENDED and would no-op.
      const room = findActiveOrEnded(u.userId);
      if (room) {
        matches.closeRoom(room, u.userId);
        socket.leave(room.id);
      }
    });

    socket.on(TT_CLIENT_EVENTS.leave, () => {
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
      // During the post-round new-round window just update the ready count; that
      // window's own grace (or all-ready) resolves the restart/teardown shortly.
      if (room.status === "ENDED") {
        matches.sync(room);
        return;
      }
      // Hold the seat for the reconnect grace in the LOBBY as well as a live match —
      // a creator who backgrounds the tab (or leaves to a share sheet / messaging app)
      // to share the invite link must NOT be dropped, which would tear down the room
      // before anyone can join. Only an explicit leave/close removes them immediately;
      // an actual abandonment is handled when the grace expires.
      seat.graceTimer = setTimeout(() => {
        const r = matches.get(room.id);
        if (r) matches.withdraw(r, u.userId);
      }, TT_TIMING.reconnectGraceMs);
      matches.sync(room);
    });
  });
}
