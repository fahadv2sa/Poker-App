import { createServer } from "node:http";
import { Server } from "socket.io";
import { loadRanks } from "./factory.js";
import { attachSocketHandlers } from "./socket.js";
import { InMemoryRoomStore } from "./store.js";

/**
 * Authoritative game server (Socket.IO) — Phase 3. Owns in-memory room state,
 * timers, the game state machine, and writes to PostgreSQL inside transactions
 * (Ante/Bet/AllIn/Fold/Resolve + side pots). Pure rules live in @fp/engine.
 */
async function main(): Promise<void> {
  const port = Number(process.env.GAME_SERVER_PORT ?? 4000);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin, credentials: true },
  });

  // Authentication middleware: in production this validates the Auth.js session
  // cookie (Section 16) and attaches the verified identity. The handshake auth
  // payload is a development stand-in until the web app wires the session.
  io.use((socket, next) => {
    const auth = socket.handshake.auth as {
      userId?: string;
      username?: string;
      playerNumber?: number;
    };
    if (!auth?.userId || !auth.username) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    socket.data.user = {
      userId: auth.userId,
      username: auth.username,
      playerNumber: auth.playerNumber ?? 0,
    };
    next();
  });

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
