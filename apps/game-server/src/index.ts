import { createServer } from "node:http";
import { Server } from "socket.io";
import { rateLimit, type RateStore } from "@fb/shared";
import { isSessionInactive, touchUserActivity } from "@fb/db";
import { SessionExpiredError, verifyRealtimeToken } from "./auth.js";
import { loadRanks } from "./factory.js";
import { PrismaRoomPersistence } from "./persistence.js";
import { reconcileOrphanedGames } from "./recovery.js";
import { attachSocketHandlers } from "./socket.js";
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
  const httpServer = createServer((req, res) => {
    const url = req.url ?? "";
    if (req.method === "GET" && url.startsWith("/internal/rooms")) {
      if (internalToken && req.headers["x-internal-token"] !== internalToken) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const rooms = store.list().map((room) => {
        const s = room.state;
        const connected = s.players.filter((p) => p.connected);
        const bots = connected.filter((p) => p.isBot).length;
        return {
          gameId: s.gameId,
          filled: connected.length,
          max: s.maxPlayers,
          bots,
          humans: connected.length - bots,
          phase: s.phase,
          status: s.status,
        };
      });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ rooms }));
      return;
    }
    if (req.method === "GET" && url.startsWith("/internal/admin/rooms")) {
      // Admin live-room inspection (super-admin dashboard, read-only). Returns
      // per-seat identity, so unlike /internal/rooms the token is REQUIRED — if
      // INTERNAL_API_TOKEN is unset or mismatched, the endpoint is closed (401).
      if (!internalToken || req.headers["x-internal-token"] !== internalToken) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
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
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ rooms }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
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
  let bots: BotRuntime | undefined;
  if (process.env.BOTS_ENABLED === "true") {
    const identities = await loadBotIdentities();
    bots = new BotRuntime(identities);
    console.log(`[bots] enabled — ${identities.length} identities loaded`);
  } else {
    console.log("[bots] disabled");
  }

  attachSocketHandlers(io, store, ranks, bots);

  httpServer.listen(port, () => {
    console.log(`Game server listening on :${port} (CORS origin ${origin})`);
  });
}

main().catch((err) => {
  console.error("Game server failed to start:", err);
  process.exit(1);
});
