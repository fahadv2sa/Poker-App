import { createServer } from "node:http";
import { Server } from "socket.io";
import { rateLimit, type RateStore } from "@fb/shared";
import { isSessionInactive, isUserDisabled, touchUserActivity } from "@fb/db";
import { SessionExpiredError, verifyRealtimeToken } from "./auth.js";
import { PrismaGpFactsSource } from "./facts.js";
import { GpMatches } from "./match.js";
import { PrismaGpPersistence } from "./persistence.js";
import { reconcileOrphanedMatches } from "./recovery.js";
import { attachSocketHandlers } from "./socket.js";

/**
 * Guess the Player (خمن اللاعب) authoritative game-server (Socket.IO) —
 * game #3 on the Football B platform, a SEPARATE Railway service
 * (`game-server-guess-player`). Owns in-memory match state, timers, and the
 * turn state machine; pure verification/scoring rules live in
 * @fb/guess-player-engine; all football reads go through the @fb/db seam.
 * Writes only to the guess_player schema. NO bots in v1 (approved).
 */
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? 4200);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3100";

  // Crash/restart recovery BEFORE accepting traffic (mirrors Link Up/Top Ten).
  await reconcileOrphanedMatches();

  const httpServer = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && u.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    // Live, non-sensitive room occupancy for the join page (mirrors Top Ten's
    // /internal/rooms). Lists OPEN public manual rooms ONLY — quick-play tables
    // are matchmaking-only and never listed (no invite code, unjoinable from a
    // list). NEVER exposes the hidden player. Private manual rooms are never
    // listed.
    if (req.method === "GET" && u.pathname === "/internal/rooms") {
      const rooms = matches
        .list()
        .filter((r) => r.kind === "MANUAL" && r.status === "LOBBY" && !r.isPrivate)
        .map((r) => ({
          id: r.id,
          code: r.inviteCode,
          name: r.roomName,
          mode: r.mode,
          difficulty: r.difficulty,
          kind: r.kind,
          status: r.status,
          filled: r.seats.filter((s) => s.connected).length,
          max: r.maxPlayers,
          creator:
            r.seats.find((s) => s.userId === r.createdByUserId)?.username ??
            r.seats[0]?.username ??
            "—",
        }));
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ rooms }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const io = new Server(httpServer, { cors: { origin, credentials: true } });

  const matches = new GpMatches({
    facts: new PrismaGpFactsSource(),
    persist: new PrismaGpPersistence(),
    emit: (target, event, payload) => io.to(target).emit(event, payload),
  });

  // Rate-limit connection attempts per IP (before auth).
  const wsRateStore: RateStore = new Map();
  io.use((socket, next) => {
    const ip = socket.handshake.address || "unknown";
    const { allowed } = rateLimit(wsRateStore, `gp:${ip}`, 30, 60_000);
    next(allowed ? undefined : new Error("RATE_LIMITED"));
  });

  // Identity: the shared AUTH_SECRET realtime token (cross-game contract §3).
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

  attachSocketHandlers(io, matches);

  httpServer.listen(port, () => {
    console.log(`Guess the Player server listening on :${port} (CORS origin ${origin})`);
  });
}

main().catch((err) => {
  console.error("Guess the Player server failed to start:", err);
  process.exit(1);
});
