import { randomBytes } from "node:crypto";
import { Prisma, getWalletBalance, prisma, touchUserActivity } from "@fb/db";
import type { Action } from "@fb/engine";
import {
  CLIENT_EVENTS,
  DEFAULT_GAME_CONFIG,
  QUICK_PLAY,
  RECONNECT_GRACE_MS,
  SERVER_EVENTS,
  actionPlaceSchema,
  queueJoinSchema,
  roomJoinSchema,
  type Difficulty,
  type StateSyncPayload,
} from "@fb/shared";
import type { Server, Socket } from "socket.io";
import { computeLivePots, GameRoom, type RoomDeps } from "./room.js";
import type { CardSource, Emitter, RoomPersistence } from "./ports.js";
import { Matchmaking } from "./matchmaking.js";
import { hydrateRoom } from "./factory.js";
import { PrismaCardSource } from "./cards.js";
import { PrismaRoomPersistence } from "./persistence.js";
import { NodeTimerService, systemClock } from "./timers.js";
import type { RoomStore } from "./store.js";
import type { BotRuntime } from "./bots/runtime.js";
import { hasConnectedHuman } from "./presence.js";
import type { RankInfo, RoomPlayer, RoomState } from "./types.js";

const roomKey = (gameId: string) => `game:${gameId}`;

/**
 * Data-layer seam for the socket handlers. Production uses the Prisma-backed
 * default below; the socket-layer tests inject in-memory fakes so the wiring
 * (join/leave/release/teardown) is testable with real socket.io clients and
 * NO database — the same injected-deps design the Top Ten / Guess the Player
 * servers use. Behavior with the default is byte-identical to the previous
 * direct calls.
 */
export interface SocketDataDeps {
  /** Resolve an invite code to the game row (id + authoritative room kind). */
  findGameByInvite(inviteCode: string): Promise<{ id: string; kind: "MANUAL" | "QUICK_PLAY" } | null>;
  /** Authoritative wallet balance (join seating + queue entry gate). */
  getBalance(userId: string): Promise<bigint>;
  /** Load a room's persisted state (null for ABANDONED/missing rooms). */
  hydrate(gameId: string, ranks: RankInfo[]): Promise<RoomState | null>;
  /** Per-room card source / persistence used by hydrated runtimes. */
  makeCards(): CardSource;
  makePersistence(): RoomPersistence;
  /** Fire-and-forget session-activity touch (never throws). */
  touchActivity(userId: string): void;
  /** Create a Quick Play Game row (matchmaking). */
  createQuickGame(tier: Difficulty, hostUserId: string): Promise<{ gameId: string; inviteCode: string }>;
}

const quickInviteCode = () =>
  randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 8).toUpperCase();

const prismaDataDeps: SocketDataDeps = {
  async findGameByInvite(inviteCode) {
    const game = await prisma.game.findUnique({
      where: { inviteCode },
      select: { id: true, kind: true },
    });
    return game as { id: string; kind: "MANUAL" | "QUICK_PLAY" } | null;
  },
  getBalance: (userId) => getWalletBalance(userId),
  hydrate: (gameId, ranks) => hydrateRoom(gameId, ranks),
  makeCards: () => new PrismaCardSource(),
  makePersistence: () => new PrismaRoomPersistence(),
  touchActivity: (userId) => void touchUserActivity(userId),
  async createQuickGame(tier, hostUserId) {
    const game = await prisma.game.create({
      data: {
        roomName: `لعب سريع — ${tier}`,
        isPrivate: true, // never listed in the public rooms list
        kind: "QUICK_PLAY", // authoritative room-type: matchmaking-only, no rejoin
        maxPlayers: QUICK_PLAY.maxSeats,
        difficulty: tier,
        inviteCode: quickInviteCode(),
        createdBy: hostUserId, // first queued player hosts (host-transfer applies)
        config: {
          ...DEFAULT_GAME_CONFIG,
          ante: QUICK_PLAY.entryByTier[tier],
          resolveMode: QUICK_PLAY.resolveMode,
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, inviteCode: true },
    });
    return { gameId: game.id, inviteCode: game.inviteCode };
  },
};

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
  /** userId → socket id for humans WAITING to be seated (Quick Play join-after-
   *  round spectators). Promoted into `seats` when the room seats them. */
  pending: Map<string, string>;
}

/** Identity attached to a socket (set during authentication). */
interface SocketUser {
  userId: string;
  username: string;
  playerNumber: number;
}

/**
 * Live-runtime controls for the super-admin dashboard, returned by
 * `attachSocketHandlers` and invoked from the internal HTTP endpoint. They reuse
 * the same teardown/leave paths the live game uses, so refunds (through the
 * ledger) and client notifications stay correct.
 */
export interface AdminControls {
  /** Force-close a live table: void+refund its hand (room.close) and tear it down. */
  closeRoom(gameId: string): Promise<"closed" | "not_found">;
  /** Remove one seat (same as a voluntary leave) and disconnect its socket. */
  kickSeat(gameId: string, seat: number): Promise<"kicked" | "not_found" | "no_seat">;
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
  ranks: RankInfo[],
  bots?: BotRuntime,
  data: SocketDataDeps = prismaDataDeps,
): AdminControls {
  const runtimes = new Map<string, RoomRuntime>();
  // gameId → userIds an admin has kicked from THIS room. Blocks rejoin (incl.
  // manual rooms, which otherwise allow it). Lives with the in-memory room and is
  // cleared on teardown — rooms are ephemeral, so a fresh gameId starts clean.
  const kickedByRoom = new Map<string, Set<string>>();

  const buildDeps = (
    gameId: string,
    seats: Map<number, string>,
    pending: Map<string, string>,
  ): RoomDeps => ({
    cards: data.makeCards(),
    persistence: data.makePersistence(),
    emitter: new SocketEmitter(io, gameId, seats),
    timers: new NodeTimerService(),
    clock: systemClock,
    // Optional bot turn-driver (only present when BOTS_ENABLED). Undefined here ⇒
    // the room's bot seam is inert and the base game is unchanged.
    bots: bots?.controller,
    // Quick Play join-after-round: when the room seats a waiting human, bind their
    // spectator socket to the new seat and send them a private snapshot carrying
    // their seat (so the client knows yourSeat before hand:started / game:dealt).
    bindSeat: (userId, seat) => {
      const sid = pending.get(userId);
      if (!sid) return;
      seats.set(seat, sid);
      pending.delete(userId);
      const rt = runtimes.get(gameId);
      if (rt) io.to(sid).emit(SERVER_EVENTS.stateSync, buildStateSync(rt.room.state, seat));
    },
    releaseBot: bots ? (playerNumber) => bots.releaseOne(playerNumber) : undefined,
    // 30-min idle close (platform rule): no human action for IDLE_CLOSE_MS →
    // close + tear down through the normal path (voids/refunds any live hand).
    onIdle: () => {
      const rt = runtimes.get(gameId);
      if (rt) {
        void closeAndTeardown(gameId, rt, "IDLE").catch((err) =>
          console.error("[idle] close failed", err),
        );
      }
    },
  });

  async function getRuntime(gameId: string): Promise<RoomRuntime | null> {
    const existing = store.get(gameId);
    if (existing) {
      const rt = runtimes.get(gameId);
      if (rt) return rt;
    }
    const state = await data.hydrate(gameId, ranks);
    if (!state) return null;
    const seats = new Map<number, string>();
    const pending = new Map<string, string>();
    const room = new GameRoom(state, buildDeps(gameId, seats, pending));
    const rt: RoomRuntime = { room, seats, pending };
    store.set(room);
    runtimes.set(gameId, rt);
    return rt;
  }

  // Per-game teardown guard: serializes the host-close and the auto-empty cleanup
  // so a room is closed (and its hand refunded) exactly once even if they race.
  const closingGames = new Set<string>();

  // Reconnection grace: a dropped socket arms a deferred cleanup keyed by
  // `${gameId}:${userId}`. A reconnect (room:join) clears it, so backgrounding the
  // tab and returning within the grace never loses the seat/room. Map holds the
  // pending timer per disconnected user.
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const graceKey = (gameId: string, userId: string) => `${gameId}:${userId}`;
  const cancelGrace = (gameId: string, userId: string) => {
    const t = disconnectTimers.get(graceKey(gameId, userId));
    if (t) {
      clearTimeout(t);
      disconnectTimers.delete(graceKey(gameId, userId));
    }
  };

  // ── Quick Play matchmaking ───────────────────────────────────────────────
  // Auto-creates a private table (reusing the normal Game row + lifecycle) when
  // a tier queue fills, then deals once the matched players have joined.
  const matchmaking = new Matchmaking({
    io,
    createQuickGame: (tier: Difficulty, hostUserId: string) =>
      data.createQuickGame(tier, hostUserId),
    async startTable(gameId: string) {
      const rt = await getRuntime(gameId);
      if (!rt || rt.room.state.status !== "LOBBY") return; // already started / gone
      if (bots) {
        const humans = rt.room.state.players.filter((p) => p.connected && !p.isBot);
        // If everyone navigated away during the grace, don't spin up a bot-only
        // table — tear it down so no empty/bot-only room lingers.
        if (humans.length < 1) {
          await closeAndTeardown(gameId, rt, "EMPTY");
          return;
        }
        // Cold start: top up the remaining empty seats with bots before dealing.
        bots.fill(rt.room.state);
      }
      if (rt.room.state.players.filter((p) => p.connected).length < 2) return; // still too few
      try {
        await rt.room.start();
      } catch (err) {
        console.error("[matchmaking] startTable failed", err);
      }
    },
    botFillWindowSec: bots ? QUICK_PLAY.botFillWindowSec : undefined,
  });

  /**
   * Close a room and remove it: void+refund any live hand and mark the game
   * ABANDONED (room.close), notify clients to leave, force every socket out of
   * the Socket.IO room, then drop the in-memory runtime + store entry. If the
   * money/persist step throws, the room is left intact and the error propagates.
   */
  async function closeAndTeardown(
    gameId: string,
    rt: RoomRuntime,
    reason: "CLOSED_BY_HOST" | "EMPTY" | "IDLE",
  ): Promise<void> {
    if (closingGames.has(gameId)) return;
    closingGames.add(gameId);
    try {
      await rt.room.close();
      // Return this table's bot identities to the pool + cancel pending bot actions.
      bots?.release(rt.room.state);
      io.to(roomKey(gameId)).emit(SERVER_EVENTS.roomClosed, { reason });
      io.in(roomKey(gameId)).socketsLeave(roomKey(gameId));
      rt.seats.clear();
      runtimes.delete(gameId);
      kickedByRoom.delete(gameId);
      store.delete(gameId);
    } finally {
      closingGames.delete(gameId);
    }
  }

  /**
   * L-1 (one table at a time): entering a room releases any seat the user still
   * holds in ANOTHER room, through the SAME leave path a voluntary exit uses
   * (park/fold rules, host transfer, empty-table teardown). Without this, a
   * second tab — or a grace-held seat — let one user accumulate live seats
   * across tables. Runs only AFTER the new room admitted them, so a failed
   * join (full/started) never costs the seat they already have.
   */
  async function releaseOtherRooms(userId: string, exceptGameId: string): Promise<void> {
    for (const [gid, rt] of runtimes) {
      if (gid === exceptGameId) continue;
      const hasPending = rt.pending.has(userId);
      const seatEntry = rt.room.state.players.find(
        (p) => p.userId === userId && p.connected && !p.isBot,
      );
      if (!hasPending && !seatEntry) continue;
      cancelGrace(gid, userId);
      rt.pending.delete(userId);
      rt.room.cancelPendingJoin(userId);
      if (seatEntry) {
        const oldSid = rt.seats.get(seatEntry.seat);
        rt.seats.delete(seatEntry.seat);
        rt.room.handlePlayerLeft(seatEntry.seat);
        io.to(roomKey(gid)).emit(SERVER_EVENTS.playerLeft, {
          seat: seatEntry.seat,
          username: seatEntry.username,
        });
        // A still-open tab on the old table (multi-tab case): eject it from the
        // socket room and tell it the seat moved. The socket stays CONNECTED —
        // disconnecting it would trigger the client's auto-reconnect + rejoin
        // and ping-pong the user's seat between the two tables forever.
        if (oldSid) {
          const old = io.sockets.sockets.get(oldSid);
          old?.leave(roomKey(gid));
          old?.emit(SERVER_EVENTS.roomClosed, { reason: "SEAT_RELEASED" });
        }
      }
      if (hasConnectedHuman(rt.room.state.players)) {
        io.to(roomKey(gid)).emit(
          SERVER_EVENTS.stateSync,
          buildStateSync(rt.room.state, null),
        );
      } else {
        await closeAndTeardown(gid, rt, "EMPTY");
      }
    }
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
        data.touchActivity(user.userId); // joining/rejoining counts as activity
        const input = roomJoinSchema.parse(raw);
        const game = await data.findGameByInvite(input.inviteCode);
        if (!game) return emitError(socket, "ROOM_NOT_FOUND", "الغرفة غير موجودة");
        const rt = await getRuntime(game.id);
        // getRuntime returns null for ABANDONED (closed) rooms — gone for good.
        if (!rt) return emitError(socket, "ROOM_NOT_FOUND", "الغرفة غير موجودة");

        // An admin kick bans this user from rejoining THIS room (manual rooms
        // included, which otherwise allow rejoin while open).
        if (kickedByRoom.get(game.id)?.has(user.userId)) {
          return emitError(socket, "KICKED", "تمت إزالتك من هذه الطاولة");
        }

        // Is this user already a seated member of this room? (The rejoin rule
        // depends on room kind.) Rooms have no password — a private room is simply
        // unlisted; anyone holding the invite link or room code may enter.
        const existing = rt.room.state.players.find((p) => p.userId === user.userId);

        // Rule 4: Quick Play rooms forbid rejoin once a player has left. The
        // authoritative signal is an existing seat that is no longer connected.
        // (Manual rooms fall through and rejoin normally while the room is open.)
        if (game.kind === "QUICK_PLAY" && existing && !existing.connected) {
          return emitError(
            socket,
            "NO_REJOIN",
            "لا يمكنك العودة إلى مباراة اللعب السريع بعد مغادرتها",
          );
        }

        // Quick Play "join after the current round": a NEW human entering a LIVE
        // quick-play room (from the room list) can't take a seat mid-hand. Hold
        // them as a spectator and queue them; the next hand seats them by
        // replacing a bot (room.admitPendingJoins). Manual rooms and quick-play
        // LOBBY rooms fall through to the normal seating path below.
        if (game.kind === "QUICK_PLAY" && !existing && rt.room.state.status !== "LOBBY") {
          if (!rt.room.canAdmit()) {
            return emitError(socket, "ROOM_FULL", "الطاولة ممتلئة — لا يوجد مقعد متاح");
          }
          rt.pending.set(user.userId, socket.id);
          rt.room.enqueueJoin({
            userId: user.userId,
            username: user.username,
            playerNumber: user.playerNumber,
          });
          joinedGameId = game.id;
          await socket.join(roomKey(game.id));
          await releaseOtherRooms(user.userId, game.id); // one table at a time
          rt.room.touchIdle(); // a human entering is activity
          socket.emit(SERVER_EVENTS.stateSync, buildStateSync(rt.room.state, null));
          // Informational — the client renders SPECTATING as a calm notice.
          emitError(socket, "SPECTATING", "ستنضمّ إلى اللعب بعد انتهاء الجولة الحالية");
          return;
        }

        // FIX #2: seat the player with their real wallet balance as `available`.
        const balance = await data.getBalance(user.userId);
        const player = seatPlayer(rt.room.state, user, balance);
        rt.seats.set(player.seat, socket.id);
        joinedGameId = game.id;
        // Reconnection: their socket dropped and is now back within the grace —
        // cancel the pending disconnect cleanup so they were never "left".
        cancelGrace(game.id, user.userId);
        await socket.join(roomKey(game.id));
        await releaseOtherRooms(user.userId, game.id); // one table at a time
        rt.room.touchIdle(); // a human joining/rejoining is activity

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
        if (rt.room.state.hostUserId !== user.userId) {
          return emitError(socket, "NOT_HOST", "المضيف فقط يبدأ اللعبة");
        }
        rt.room.touchIdle();
        await rt.room.start();
      }),
    );

    // Host closes the table: server-side creator check (identity from the verified
    // token, never the client), then void+refund any live hand and delete the room.
    socket.on(CLIENT_EVENTS.roomClose, () =>
      guard(socket, async () => {
        if (!joinedGameId) return emitError(socket, "NO_ROOM", "لست في غرفة");
        const rt = runtimes.get(joinedGameId);
        if (!rt) return emitError(socket, "NO_ROOM", "لست في غرفة");
        if (rt.room.state.hostUserId !== user.userId) {
          return emitError(socket, "NOT_HOST", "المضيف فقط يغلق الطاولة");
        }
        await closeAndTeardown(joinedGameId, rt, "CLOSED_BY_HOST");
      }),
    );

    // Batch 1: explicit between-hands gate — the host deals the next hand; the
    // server only then charges antes (no auto-deal). startNextHand re-checks
    // eligibility and rotates the dealer.
    socket.on(CLIENT_EVENTS.nextHand, () =>
      guard(socket, async () => {
        const rt = joinedGameId ? runtimes.get(joinedGameId) : undefined;
        if (!rt) return emitError(socket, "NO_ROOM", "لست في غرفة");
        if (rt.room.state.hostUserId !== user.userId) {
          return emitError(socket, "NOT_HOST", "المضيف فقط يبدأ الجولة التالية");
        }
        rt.room.touchIdle();
        await rt.room.startNextHand();
      }),
    );

    socket.on(CLIENT_EVENTS.actionPlace, (raw: unknown) =>
      guard(socket, async () => {
        // Active play keeps the session alive so a long, continuously-connected
        // hand never trips the inactivity window (throttled + guarded, no await).
        data.touchActivity(user.userId);
        const input = actionPlaceSchema.parse(raw);
        const rt = joinedGameId ? runtimes.get(joinedGameId) : undefined;
        if (!rt) return emitError(socket, "NO_ROOM", "لست في غرفة");
        const seat = seatOf(rt, socket.id);
        if (seat === null) return emitError(socket, "NO_SEAT", "لا مقعد لك");
        const action: Action = {
          type: input.type as Action["type"],
          amount: input.amount !== undefined ? BigInt(input.amount) : undefined,
        };
        rt.room.touchIdle(); // a real player's bet/fold is activity (bots bypass this handler)
        await rt.room.placeAction(seat, action);
      }),
    );

    // Winner screen "New Round": mark this player's seat ready. The room starts
    // the next hand once all connected humans are ready (bots auto-ready) or when
    // the grace elapses — fully server-authoritative.
    socket.on(CLIENT_EVENTS.roundReady, () =>
      guard(socket, async () => {
        const rt = joinedGameId ? runtimes.get(joinedGameId) : undefined;
        if (!rt) return emitError(socket, "NO_ROOM", "لست في غرفة");
        const seat = seatOf(rt, socket.id);
        if (seat === null) return emitError(socket, "NO_SEAT", "لا مقعد لك");
        rt.room.touchIdle(); // pressing "New Round" is activity
        rt.room.markReady(seat);
      }),
    );

    // ── Quick Play queue ───────────────────────────────────────────────────
    socket.on(CLIENT_EVENTS.queueJoin, (raw: unknown) =>
      guard(socket, async () => {
        const { difficulty } = queueJoinSchema.parse(raw);
        // Gate on affording the tier's entry (= the table ante). No charge here —
        // the queue NEVER deducts; the first charge is the ante at the table's
        // first deal. So leaving the queue costs nothing.
        const balance = await data.getBalance(user.userId);
        if (balance < BigInt(QUICK_PLAY.entryByTier[difficulty])) {
          return emitError(socket, "LOW_BALANCE", "رصيدك لا يكفي لرسوم الدخول");
        }
        matchmaking.join(socket.id, user, difficulty);
      }),
    );
    socket.on(CLIENT_EVENTS.queueLeave, () => matchmaking.leave(socket.id));

    const leave = async () => {
      if (!joinedGameId) return;
      const rt = runtimes.get(joinedGameId);
      if (!rt) return;
      // A still-waiting spectator (Quick Play join-after-round) who leaves before
      // being seated: drop them from the queue. No-op for seated players.
      rt.pending.delete(user.userId);
      rt.room.cancelPendingJoin(user.userId);
      const seat = seatOf(rt, socket.id);
      if (seat !== null) {
        rt.seats.delete(seat);
        const username = rt.room.state.players.find((p) => p.seat === seat)?.username ?? "";
        // Feature #7: the room drops them from the next hand (and parks them now
        // if we're between hands) without tearing down the live session.
        rt.room.handlePlayerLeft(seat);
        // Batch 2: tell the rest of the table so they can show a banner. Use the
        // server instance (not `socket.to`) because this may run from the deferred
        // grace timer, after the originating socket is already disconnected.
        io.to(roomKey(joinedGameId)).emit(SERVER_EVENTS.playerLeft, { seat, username });
      }
      // A table is kept alive only while a real HUMAN is still connected. Bots are
      // seated connected:true (they have no socket) and must NOT keep an abandoned
      // table alive — otherwise a bot-containing table would never tear down once
      // its humans leave (leaking the room/deck/bot-identities until a restart).
      const humanConnected = hasConnectedHuman(rt.room.state.players);
      // Host may have transferred (handlePlayerLeft) — push a fresh snapshot to the
      // remaining humans. Skip if the room is about to close (no humans left).
      if (humanConnected) {
        io.to(roomKey(joinedGameId)).emit(
          SERVER_EVENTS.stateSync,
          buildStateSync(rt.room.state, null),
        );
      }
      // Auto-cleanup: once no HUMAN remains, close the room (voiding + refunding any
      // live hand, releasing the bot identities, deleting it) — so an abandoned
      // bot-containing table never lingers.
      if (!humanConnected) {
        await closeAndTeardown(joinedGameId, rt, "EMPTY");
      }
    };
    socket.on(CLIENT_EVENTS.roomLeave, () => {
      // Explicit leave (a manual action) is immediate — no grace.
      if (joinedGameId) cancelGrace(joinedGameId, user.userId);
      void leave().catch((err) => console.error("room:leave cleanup failed", err));
    });
    socket.on("disconnect", () => {
      matchmaking.leave(socket.id); // drop from any Quick Play queue, cleanly
      if (!joinedGameId) return;
      const rt = runtimes.get(joinedGameId);
      if (!rt) return;
      // Only the socket that currently holds the seat schedules cleanup; if a
      // reconnect already rebound the seat to a newer socket, this stale
      // disconnect is a no-op (and must not re-arm the grace).
      if (seatOf(rt, socket.id) === null) return;
      // RECONNECTION GRACE: a dropped socket (backgrounding the tab, a brief
      // network blip) is NOT treated as leaving. Hold the seat + room; the real
      // cleanup runs only if no reconnect arrives within the grace. A reconnect
      // (room:join) cancels this. The player stays seated/connected meanwhile, so
      // the room is never torn down and no "left" banner fires prematurely.
      const gameId = joinedGameId;
      const key = graceKey(gameId, user.userId);
      const existing = disconnectTimers.get(key);
      if (existing) clearTimeout(existing);
      disconnectTimers.set(
        key,
        setTimeout(() => {
          disconnectTimers.delete(key);
          void leave().catch((err) => console.error("disconnect cleanup failed", err));
        }, RECONNECT_GRACE_MS),
      );
    });
  });

  // ── Admin controls (super-admin dashboard) ───────────────────────────────
  // Reuse the SAME proven teardown/leave paths the live game uses, so refunds
  // (through the ledger) and notifications stay correct — the admin layer never
  // reinvents the money path.
  const controls: AdminControls = {
    async closeRoom(gameId) {
      const rt = runtimes.get(gameId);
      if (!rt) return "not_found";
      // Reuse the host-close reason for the client notice (the player just sees
      // the table was closed; no client/contract change needed).
      await closeAndTeardown(gameId, rt, "CLOSED_BY_HOST");
      return "closed";
    },
    async kickSeat(gameId, seat) {
      const rt = runtimes.get(gameId);
      if (!rt) return "not_found";
      const player = rt.room.state.players.find((p) => p.seat === seat && p.connected);
      if (!player) return "no_seat";
      const sid = rt.seats.get(seat);
      const { username, userId } = player;
      // Ban this user from rejoining the room (true kick — manual rooms included).
      let banned = kickedByRoom.get(gameId);
      if (!banned) {
        banned = new Set<string>();
        kickedByRoom.set(gameId, banned);
      }
      banned.add(userId);
      // Mirror the voluntary-leave path exactly: handlePlayerLeft refunds/folds the
      // live hand correctly; then force the socket out and tear down if empty.
      cancelGrace(gameId, userId);
      rt.seats.delete(seat);
      rt.room.handlePlayerLeft(seat);
      io.to(roomKey(gameId)).emit(SERVER_EVENTS.playerLeft, { seat, username });
      if (sid) io.sockets.sockets.get(sid)?.disconnect(true);
      if (hasConnectedHuman(rt.room.state.players)) {
        io.to(roomKey(gameId)).emit(SERVER_EVENTS.stateSync, buildStateSync(rt.room.state, null));
      } else {
        await closeAndTeardown(gameId, rt, "EMPTY");
      }
      return "kicked";
    },
  };
  return controls;
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
  if (state.status !== "LOBBY") throw new Error("المباراة بدأت — لا يمكن الانضمام الآن");
  if (state.players.length >= state.maxPlayers) throw new Error("الطاولة ممتلئة — لا يوجد مقعد متاح");
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
      nameAr: c.nameAr ?? null,
      nationality: c.nationality,
      position: c.position,
      clubs: [...c.clubs],
      photoUrl: c.photoUrl,
      fameScore: c.fameScore ?? null,
    })),
    pot: Number(state.players.reduce((s, p) => s + p.committedTotal, 0n)),
    pots: computeLivePots(state),
    currentBet: Number(state.currentBet),
    dealerSeat: state.dealerSeat,
    currentTurnSeat: state.currentTurnSeat,
    turnDeadlineTs: state.turnDeadlineTs,
    yourSeat,
    hostSeat:
      state.players.find((p) => p.userId === state.hostUserId && p.connected)?.seat ?? null,
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
