import { createServer } from "node:http";
import { Server } from "socket.io";
import { rateLimit, type RateStore } from "@fp/shared";
import { SessionExpiredError, verifyRealtimeToken } from "./auth.js";
import { loadRanks } from "./factory.js";
import { PrismaRoomPersistence } from "./persistence.js";
import { reconcileOrphanedGames } from "./recovery.js";
import { attachSocketHandlers } from "./socket.js";
import { InMemoryRoomStore } from "./store.js";

/**
 * Authoritative game server (Socket.IO) — Phase 3. Owns in-memory room state,
 * timers, the game state machine, and writes to PostgreSQL inside transactions
 * (Ante/Bet/AllIn/Fold/Resolve + side pots). Pure rules live in @fp/engine.
 */
async function main(): Promise<void> {
  // Railway (and most managed hosts) inject PORT; fall back to GAME_SERVER_PORT
  // for local dev, then 4000.
  const port = Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? 4000);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  const httpServer = createServer();
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
      socket.data.user = await verifyRealtimeToken(token);
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
  const store = new InMemoryRoomStore();
  attachSocketHandlers(io, store, ranks);

  httpServer.listen(port, () => {
    console.log(`Game server listening on :${port} (CORS origin ${origin})`);
  });
}

main().catch((err) => {
  console.error("Game server failed to start:", err);
  process.exit(1);
});
