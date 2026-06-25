import { createServer } from "node:http";
import { Server } from "socket.io";
import { rateLimit, type RateStore } from "@fb/shared";
import { isSessionInactive, isUserDisabled, touchUserActivity } from "@fb/db";
import { SessionExpiredError, verifyRealtimeToken } from "./auth.js";
import { loadRanks } from "./factory.js";
import { PrismaRoomPersistence } from "./persistence.js";
import { reconcileOrphanedGames } from "./recovery.js";
import { attachSocketHandlers, type AdminControls } from "./socket.js";
import { InMemoryRoomStore } from "./store.js";
import { loadBotIdentities } from "./bots/identities.js";
import { BotRuntime } from "./bots/runtime.js";

/**
 * Authoritative game server (Socket.IO) — Phase 3. Owns in-memory room state,
 * timers, the game state machine, and writes to PostgreSQL inside transactions
 * (Ante/Bet/AllIn/Fold/Resolve + side pots). Pure rules live in @fb/engine.
 */
async function main(): Promise<void> {
  // Railway (and most managed hosts) inject PORT; fall back to GAME_SERVER_PORT
  // for local dev, then 4000.
  const port = Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? 4000);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  // Authoritative in-memory room registry (also read by the internal endpoint).
  const store = new InMemoryRoomStore();

  // Internal live-occupancy endpoint for the room list. The web reads it
  // server-side to show real filled/max (incl. in-memory bots) for Quick Play
  // rooms. Returns ONLY non-sensitive aggregate seat counts. Optionally gated by
  // INTERNAL_API_TOKEN. Socket.IO delegates non-engine.io requests to this
  // handler, so a plain createServer(handler) is the correct pattern.
  const internalToken = process.env.INTERNAL_API_TOKEN;
  // Bot runtime + the live-control surface are constructed later in main(); the
  // HTTP handler (created now) reads them at REQUEST time, by when they're set.
  let bots: BotRuntime | undefined;
  let adminControls: AdminControls | undefined;
  const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" } as const;

  const httpServer = createServer((req, res) => {
    const method = req.method ?? "GET";
    const u = new URL(req.url ?? "/", "http://localhost");
    const path = u.pathname;

    // Public-ish live-occupancy read for the room list (token optional).
    if (method === "GET" && path === "/internal/rooms") {
      if (internalToken && req.headers["x-internal-token"] !== internalToken) {
        res.writeHead(401, JSON_HEADERS);
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const rooms = store.list().map((room) => {
        const s = room.state;
        const connected = s.players.filter((p) => p.connected);
        const botCount = connected.filter((p) => p.isBot).length;
        return {
          gameId: s.gameId,
          filled: connected.length,
          max: s.maxPlayers,
          bots: botCount,
          humans: connected.length - botCount,
          phase: s.phase,
          status: s.status,
        };
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ rooms }));
      return;
    }

    // Admin surface (super-admin dashboard). The token is ALWAYS required here —
    // these return identity and perform live control. Closed (401) if unset.
    if (path.startsWith("/internal/admin/")) {
      if (!internalToken || req.headers["x-internal-token"] !== internalToken) {
        res.writeHead(401, JSON_HEADERS);
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      if (method === "GET" && path === "/internal/admin/rooms") {
        const rooms = store.list().map((room) => {
          const s = room.state;
          return {
            gameId: s.gameId,
            roomName: s.roomName,
            kind: s.kind ?? "MANUAL",
            difficulty: s.difficulty ?? null,
            phase: s.phase,
            status: s.status,
            maxPlayers: s.maxPlayers,
            handNumber: s.handNumber,
            dealerSeat: s.dealerSeat,
            currentTurnSeat: s.currentTurnSeat,
            seats: s.players.map((p) => ({
              seat: p.seat,
              playerNumber: p.playerNumber,
              username: p.username,
              status: p.status,
              connected: p.connected,
              isBot: p.isBot ?? false,
              committedTotal: p.committedTotal.toString(),
              available: p.available.toString(),
            })),
          };
        });
        const botsMeta = {
          enabled: !!bots,
          paused: bots?.isPaused ?? false,
          available: bots?.availableIdentities ?? 0,
        };
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ rooms, bots: botsMeta }));
        return;
      }

      if (method === "POST" && path === "/internal/admin/close") {
        const gameId = u.searchParams.get("gameId") ?? "";
        void Promise.resolve(adminControls?.closeRoom(gameId) ?? "unavailable")
          .then((result) => {
            res.writeHead(result === "closed" ? 200 : result === "not_found" ? 404 : 503, JSON_HEADERS);
            res.end(JSON.stringify({ result }));
          })
          .catch((err) => {
            res.writeHead(500, JSON_HEADERS);
            res.end(JSON.stringify({ error: String(err) }));
          });
        return;
      }

      if (method === "POST" && path === "/internal/admin/kick") {
        const gameId = u.searchParams.get("gameId") ?? "";
        const seat = Number(u.searchParams.get("seat"));
        if (!Number.isInteger(seat)) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: "bad_seat" }));
          return;
        }
        void Promise.resolve(adminControls?.kickSeat(gameId, seat) ?? "unavailable")
          .then((result) => {
            res.writeHead(result === "kicked" ? 200 : result === "unavailable" ? 503 : 404, JSON_HEADERS);
            res.end(JSON.stringify({ result }));
          })
          .catch((err) => {
            res.writeHead(500, JSON_HEADERS);
            res.end(JSON.stringify({ error: String(err) }));
          });
        return;
      }

      if (method === "POST" && path === "/internal/admin/bots") {
        const paused = u.searchParams.get("paused") === "true";
        bots?.setPaused(paused);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ enabled: !!bots, paused: bots?.isPaused ?? false }));
        return;
      }

      res.writeHead(404, JSON_HEADERS);
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    res.writeHead(404, JSON_HEADERS);
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const io = new Server(httpServer, {
    cors: { origin, credentials: true },
  });

  // Rate limit connection attempts per IP (audit #9 / Section 16) — before auth,
  // so it also throttles repeated bad-token / brute-force attempts.
  const wsRateStore: RateStore = new Map();
  io.use((socket, next) => {
    const ip = socket.handshake.address || "unknown";
    const { allowed } = rateLimit(wsRateStore, `ws:${ip}`, 30, 60_000);
    next(allowed ? undefined : new Error("RATE_LIMITED"));
  });

  // Authentication middleware (FIX #1 / Section 16): verify the signed session
  // token the web minted from the Auth.js session. Identity comes ONLY from the
  // verified token — never from raw handshake fields. Reject otherwise; an
  // expired token gets a distinct reason so the client can ask for a refresh.
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown })?.token;
      const claims = await verifyRealtimeToken(token);
      // Inactivity auto-logout: reject a human idle past the shared window (bots
      // are exempt inside isSessionInactive). The token's own TTL bounds stale
      // tokens; this enforces the unified 2-day window via users.last_active_at,
      // so the socket layer agrees with the web cookie. Fails OPEN on DB error.
      if (await isSessionInactive(claims.userId)) {
        return next(new Error("SESSION_EXPIRED"));
      }
      // Disabled (banned) by an admin → refuse the realtime connection too, so a
      // ban takes effect on the next (re)connect, not just at web login.
      if (await isUserDisabled(claims.userId)) {
        return next(new Error("UNAUTHENTICATED"));
      }
      socket.data.user = claims;
      // Establishing the connection counts as activity (throttled + guarded).
      await touchUserActivity(claims.userId);
      next();
    } catch (err) {
      next(new Error(err instanceof SessionExpiredError ? "SESSION_EXPIRED" : "UNAUTHENTICATED"));
    }
  });

  // Crash/restart recovery (run BEFORE accepting traffic): in-memory round state
  // is lost on restart, so any game still IN_PROGRESS in the DB is orphaned — its
  // committed antes/bets were debited but never credited back. Reconcile each via
  // the ledger (refund unresolved commitments) and mark it ABANDONED. Idempotent.
  await reconcileOrphanedGames(new PrismaRoomPersistence());

  // HandRanks are data-driven: load them once at boot (re-seedable at runtime).
  const ranks = await loadRanks();

  // Quick Play bot fillers (cold-start, removable). Behind BOTS_ENABLED — when
  // off (default) nothing is constructed and the game is exactly as before. When
  // on, load the bot identities (the reserved player_number block; empty until
  // the Phase 5 importer runs) and build the bot runtime.
  if (process.env.BOTS_ENABLED === "true") {
    const identities = await loadBotIdentities();
    bots = new BotRuntime(identities);
    console.log(`[bots] enabled — ${identities.length} identities loaded`);
  } else {
    console.log("[bots] disabled");
  }

  adminControls = attachSocketHandlers(io, store, ranks, bots);

  httpServer.listen(port, () => {
    console.log(`Game server listening on :${port} (CORS origin ${origin})`);
  });
}

main().catch((err) => {
  console.error("Game server failed to start:", err);
  process.exit(1);
});
