import { createServer } from "node:http";
import { Server } from "socket.io";
import { rateLimit, type RateStore } from "@fb/shared";
import { isSessionInactive, isUserDisabled, touchUserActivity } from "@fb/db";
import { SessionExpiredError, verifyRealtimeToken } from "./auth.js";
import { CatalogSource } from "./catalog.js";
import { Matches } from "./match.js";
import { PrismaTtPersistence } from "./persistence.js";
import { reconcileOrphanedMatches } from "./recovery.js";
import { attachSocketHandlers } from "./socket.js";
import { loadBotPool, TopTenBots } from "./bots.js";

/**
 * Top Ten authoritative game-server (Socket.IO) — game #2 on the Football B
 * platform, a SEPARATE Railway service from Link Up. Owns in-memory match state,
 * timers, and the round state machine; pure rules live in @fb/top-10-engine. Reads
 * the frozen question catalog (built admin-time) and writes only to the top_10 schema.
 */
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? 4100);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3100";

  const catalog = new CatalogSource();
  await catalog.load();
  console.log(`[top-10] catalog loaded — ${catalog.size} active questions`);
  if (catalog.size === 0) {
    console.warn("[top-10] WARNING: empty catalog — run `pnpm db:build-top10-catalog` first.");
  }

  // Crash/restart recovery (run BEFORE accepting traffic): in-memory match state is
  // lost on restart, so any match still IN_PROGRESS in the DB is orphaned. Mark each
  // ABANDONED so stale rooms never accumulate. Idempotent. Mirrors Link Up.
  await reconcileOrphanedMatches();

  // Quick-play bot fillers (behind BOTS_ENABLED), mirroring Link Up's isolation.
  let bots: TopTenBots | undefined;
  if (process.env.BOTS_ENABLED === "true") {
    const pool = await loadBotPool();
    bots = new TopTenBots(pool);
    console.log(`[top-10][bots] enabled — ${pool.length} identities loaded`);
  } else {
    console.log("[top-10][bots] disabled");
  }

  const httpServer = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && u.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, questions: catalog.size }));
      return;
    }
    // Live, non-sensitive room occupancy for the join page's browser (mirrors Link
    // Up's /internal/rooms). Lists OPEN public manual rooms (friends) ONLY —
    // quick-play tables are matchmaking-only and never listed (they carry no
    // invite code, so a listed card could never be joined anyway). Private manual
    // rooms are NEVER listed — reachable only via invite link / room code.
    if (req.method === "GET" && u.pathname === "/internal/rooms") {
      const rooms = matches
        .list()
        .filter((r) => r.kind === "MANUAL" && r.status === "LOBBY" && !r.isPrivate)
        .map((r) => {
          const connected = r.seats.filter((s) => s.connected);
          const creatorSeat =
            r.seats.find((s) => s.userId === r.createdByUserId) ?? r.seats.find((s) => !s.isBot);
          return {
            id: r.id,
            code: r.inviteCode,
            name: r.roomName,
            difficulty: r.difficulty,
            kind: r.kind,
            status: r.status,
            filled: connected.length,
            max: r.maxPlayers,
            creator: creatorSeat?.username ?? "—",
          };
        });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ rooms }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const io = new Server(httpServer, { cors: { origin, credentials: true } });

  const matches = new Matches({
    catalog,
    persist: new PrismaTtPersistence(),
    emit: (matchId, event, payload) => io.to(matchId).emit(event, payload),
    bots: bots?.hooks(),
  });

  // Rate-limit connection attempts per IP (before auth).
  const wsRateStore: RateStore = new Map();
  io.use((socket, next) => {
    const ip = socket.handshake.address || "unknown";
    const { allowed } = rateLimit(wsRateStore, ` tt:${ip}`, 30, 60_000);
    next(allowed ? undefined : new Error("RATE_LIMITED"));
  });

  // Identity: verify the realtime token minted by the Top Ten web from the verified
  // Auth.js session, with the SAME AUTH_SECRET (cross-game identity contract §3).
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown })?.token;
      const claims = await verifyRealtimeToken(token);
      if (await isSessionInactive(claims.userId)) return next(new Error("SESSION_EXPIRED"));
      if (await isUserDisabled(claims.userId)) return next(new Error("UNAUTHENTICATED"));
      socket.data.user = claims;
      await touchUserActivity(claims.userId);
      next();
    } catch (err) {
      next(new Error(err instanceof SessionExpiredError ? "SESSION_EXPIRED" : "UNAUTHENTICATED"));
    }
  });

  attachSocketHandlers(io, matches, bots?.filler());

  httpServer.listen(port, () => {
    console.log(`Top Ten server listening on :${port} (CORS origin ${origin})`);
  });
}

main().catch((err) => {
  console.error("Top Ten server failed to start:", err);
  process.exit(1);
});
