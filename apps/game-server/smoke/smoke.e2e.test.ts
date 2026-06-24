import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@fb/db";
import { DEFAULT_GAME_CONFIG } from "@fb/shared";

/**
 * Opt-in END-TO-END smoke test (RUN_SMOKE=1). Stands up the REAL stack —
 * web (:3000) + game-server (:4000) + Postgres — and drives ONE complete hand
 * through the real socket path with two authenticated users. It asserts the
 * non-negotiables live: card privacy (no hole cards in any broadcast), the
 * wallet ledger settles correctly, and the outcome is server-authoritative.
 *
 * It seeds a tiny TEST-SCOPED fixture (1 nationality + 9 midfielders) to
 * guarantee enough active players to deal, then both players claim ROYAL_POSITION
 * — which is valid for ANY pool drawn from this fixture (every player is a
 * midfielder), so the split is deterministic regardless of which active players
 * the random deal pulls (the deck draws from the whole active table).
 * It tears its fixture down afterward.
 */

const ENABLED = process.env.RUN_SMOKE === "1";

const REPO = resolve(process.cwd(), "..", "..");
const WEB_DIR = resolve(REPO, "apps", "web");
const GS_DIR = resolve(REPO, "apps", "game-server");
const DB_ENV = resolve(REPO, "packages", "db", ".env");

const GS_PORT = 4000;
const WEB_PORT = 3000;
const GS_URL = `http://localhost:${GS_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const AUTH_SECRET = "smoke-e2e-secret-do-not-use-in-prod-000000=";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function databaseUrl(): string {
  const line = readFileSync(DB_ENV, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in packages/db/.env");
  return line.replace(/^DATABASE_URL=/, "").replace(/^"|"$/g, "").trim();
}

const DATABASE_URL = databaseUrl();
const baseEnv = { ...process.env, DATABASE_URL, AUTH_SECRET, NODE_OPTIONS: "--use-system-ca" };

// --- process orchestration --------------------------------------------------

const procs: ChildProcess[] = [];

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* best effort */
    }
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      /* best effort */
    }
  }
}

/** Spawn a long-running process; resolve when stdout/stderr matches `ready`. */
function spawnUntilReady(
  name: string,
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  ready: RegExp,
  timeoutMs: number,
): Promise<ChildProcess> {
  return new Promise((resolveP, reject) => {
    const child = spawn(command, { cwd, env, shell: true });
    procs.push(child);
    let out = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`${name} not ready in ${timeoutMs}ms:\n${out.slice(-2000)}`));
      }
    }, timeoutMs);
    const onData = (d: Buffer) => {
      out += d.toString();
      if (!settled && ready.test(out)) {
        settled = true;
        clearTimeout(timer);
        resolveP(child);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`${name} exited early (code ${code}):\n${out.slice(-2000)}`));
      }
    });
  });
}

function runToExit(command: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> {
  return new Promise((resolveP, reject) => {
    const child = spawn(command, { cwd, env, shell: true });
    let out = "";
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error(`build timed out:\n${out.slice(-1500)}`));
    }, timeoutMs);
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (out += d.toString()));
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveP();
      else reject(new Error(`build failed (${code}):\n${out.slice(-1500)}`));
    });
  });
}

async function pollHttp(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status > 0) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`No HTTP response from ${url} within ${timeoutMs}ms`);
}

// --- socket client helpers --------------------------------------------------

interface RecordedEvent {
  event: string;
  payload: unknown;
}

interface Client {
  socket: Socket;
  events: RecordedEvent[];
  seat: number;
  hole: Array<{ playerId: string }>;
  claimed: boolean;
  connectError?: string;
}

function waitConnect(client: Client, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolveP, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`connect timeout (connectError=${client.connectError ?? "none"})`)),
      timeoutMs,
    );
    client.socket.once("connect", () => {
      clearTimeout(timer);
      resolveP();
    });
    client.socket.once("connect_error", (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`connect_error: ${err.message}`));
    });
  });
}

function once<T = unknown>(
  socket: Socket,
  event: string,
  predicate?: (p: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  return new Promise((resolveP, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for "${event}"`));
    }, timeoutMs);
    function handler(p: T) {
      if (!predicate || predicate(p)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolveP(p);
      }
    }
    socket.on(event, handler);
  });
}

async function mintToken(user: { id: string; username: string; playerNumber: number }) {
  // Mirrors apps/web signRealtimeToken (same alg/secret/claims).
  return new SignJWT({ username: user.username, playerNumber: user.playerNumber })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(AUTH_SECRET));
}

function connectClient(token: string): Client {
  const socket = io(GS_URL, {
    auth: { token },
    reconnection: false,
  });
  const client: Client = { socket, events: [], seat: -1, hole: [], claimed: false };
  socket.onAny((event: string, payload: unknown) => client.events.push({ event, payload }));
  socket.on("connect_error", (err: Error) => {
    client.connectError = err.message;
  });
  return client;
}

// --- fixture bookkeeping ----------------------------------------------------

const runId = randomBytes(4).toString("hex");
const created = { userIds: [] as string[], playerIds: [] as string[], natId: "", gameId: "" };

async function seedFixture() {
  const mid = await prisma.position.findUniqueOrThrow({ where: { code: "MID" } });
  const nat = await prisma.nationality.create({ data: { name: `SMOKE-${runId}` } });
  created.natId = nat.id;
  for (let i = 0; i < 9; i++) {
    const p = await prisma.player.create({
      data: {
        name: `SMOKE-${runId}-P${i}`,
        nationalityId: nat.id,
        positionId: mid.id,
        active: true,
      },
      select: { id: true },
    });
    created.playerIds.push(p.id);
  }
}

async function registerViaWeb(): Promise<{ id: string; username: string; playerNumber: number }> {
  const username = `s_${runId}_${randomBytes(3).toString("hex")}`;
  const res = await fetch(`${WEB_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@smoke.local`,
      password: "smokepass123",
      confirmPassword: "smokepass123",
    }),
  });
  const data = (await res.json()) as { id?: string; playerNumber?: number; messageAr?: string };
  if (res.status !== 201 || !data.id) {
    throw new Error(`web register failed (${res.status}): ${data.messageAr ?? JSON.stringify(data)}`);
  }
  created.userIds.push(data.id);
  // New accounts are created UNVERIFIED and login is gated; the smoke flow needs a
  // usable session, so mark this throwaway account verified directly in the DB.
  await prisma.user.update({ where: { id: data.id }, data: { emailVerifiedAt: new Date() } });
  return { id: data.id, username, playerNumber: data.playerNumber ?? 0 };
}

// ---------------------------------------------------------------------------

describe.runIf(ENABLED)("END-TO-END smoke: full live hand", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    await prisma.$queryRaw`SELECT 1`;

    await seedFixture();

    // 1) game-server (real entrypoint)
    await spawnUntilReady(
      "game-server",
      "pnpm exec tsx src/index.ts",
      GS_DIR,
      { ...baseEnv, GAME_SERVER_PORT: String(GS_PORT), WEB_ORIGIN: WEB_URL },
      /listening on :/,
      90_000,
    );

    // 2) web — ensure a production build exists, then `next start`
    const webEnv = {
      ...baseEnv,
      AUTH_URL: WEB_URL,
      NEXT_PUBLIC_GAME_SERVER_URL: GS_URL,
    };
    if (!existsSync(resolve(WEB_DIR, ".next", "BUILD_ID"))) {
      await runToExit("pnpm exec next build", WEB_DIR, webEnv, 240_000);
    }
    await spawnUntilReady("web", `pnpm exec next start -p ${WEB_PORT}`, WEB_DIR, webEnv, /Ready|started server|Local:/, 120_000);
    await pollHttp(`${WEB_URL}/login`, 60_000);
  }, 300_000);

  afterAll(async () => {
    for (const p of procs) killTree(p);
    await sleep(500);
    try {
      if (created.gameId) await prisma.game.delete({ where: { id: created.gameId } }).catch(() => {});
      if (created.playerIds.length)
        await prisma.player.deleteMany({ where: { id: { in: created.playerIds } } });
      if (created.natId) await prisma.nationality.delete({ where: { id: created.natId } }).catch(() => {});
      if (created.userIds.length)
        await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("plays one hand: deal → antes → betting → showdown → ledger settlement", async () => {
    // --- the web (REST) is live: register two users -------------------------
    const userA = await registerViaWeb();
    const userB = await registerViaWeb();
    expect(userA.id).toBeTruthy();
    expect(userB.id).toBeTruthy();

    // Both start at the 1000 signup bonus.
    const startBalA = (await prisma.wallet.findUniqueOrThrow({ where: { userId: userA.id } })).balance;
    expect(startBalA).toBe(1000n);

    // --- create a room (Game row) ------------------------------------------
    const inviteCode = randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
    const game = await prisma.game.create({
      data: {
        roomName: `smoke-${runId}`,
        isPrivate: false,
        maxPlayers: 6,
        inviteCode,
        createdBy: userA.id,
        config: DEFAULT_GAME_CONFIG as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    created.gameId = game.id;

    // --- connect two real sockets with minted session tokens ----------------
    const A = connectClient(await mintToken(userA));
    await waitConnect(A);
    A.socket.emit("room:join", { inviteCode });
    const syncA = await once<{ yourSeat: number }>(A.socket, "state:sync", (p) => p.yourSeat != null);
    A.seat = syncA.yourSeat;

    const B = connectClient(await mintToken(userB));
    await waitConnect(B);
    B.socket.emit("room:join", { inviteCode });
    const syncB = await once<{ yourSeat: number }>(B.socket, "state:sync", (p) => p.yourSeat != null);
    B.seat = syncB.yourSeat;

    expect(new Set([A.seat, B.seat]).size).toBe(2);

    // --- host starts; capture private deals + the first turn ----------------
    const dealtA = once<{ holeCards: Array<{ playerId: string }> }>(A.socket, "game:dealt");
    const dealtB = once<{ holeCards: Array<{ playerId: string }> }>(B.socket, "game:dealt");
    const firstTurn = once<{ seat: number }>(A.socket, "turn:changed");
    A.socket.emit("game:start", {});
    const [hA, hB, ft] = await Promise.all([dealtA, dealtB, firstTurn]);
    A.hole = hA.holeCards;
    B.hole = hB.holeCards;
    expect(A.hole).toHaveLength(2);
    expect(B.hole).toHaveLength(2);

    // --- server-authoritative: an out-of-turn action is rejected ------------
    const offTurn = ft.seat === A.seat ? B : A;
    const errP = once<{ messageAr: string }>(offTurn.socket, "error");
    offTurn.socket.emit("action:place", { type: "CHECK" });
    const err = await errP;
    expect(err.messageAr).toMatch(/turn/i);

    // --- auto-play the betting: each client checks on its own turn ----------
    for (const c of [A, B]) {
      c.socket.on("turn:changed", (p: { seat: number }) => {
        if (p.seat === c.seat) c.socket.emit("action:place", { type: "CHECK" });
      });
    }
    const resultP = once<{ results: Array<{ seat: number; outcome: string; coinsDelta: number }> }>(
      A.socket,
      "game:result",
      undefined,
      40_000,
    );
    // The first turn's event already passed before the responder attached — kick it.
    (ft.seat === A.seat ? A : B).socket.emit("action:place", { type: "CHECK" });

    // --- showdown: winner determination is AUTOMATIC now (no self-declaration).
    //     Checking the hand down to the river makes the server evaluate each
    //     contender's strongest combination and resolve directly. Every fixture
    //     player is a midfielder, so both pools are ROYAL_POSITION with equal
    //     score sums (no fame seeded) ⇒ a deterministic split. ----------
    const result = await resultP;
    expect(result.results).toHaveLength(2);

    // give persistence a beat to commit, then read the DB
    await sleep(800);
    A.socket.disconnect();
    B.socket.disconnect();

    // === ASSERTION 1 — CARD PRIVACY (live) =================================
    // Privacy holds DURING the hand: hole cards reach only their owner via the
    // PRIVATE per-seat channels (game:dealt, and result:best — the owner's own
    // winner-screen reveal) — never any broadcast. The one exception is the
    // OFFICIAL REVEAL in game:result at showdown (SPEC §2.4), asserted below.
    const aHole = A.hole.map((c) => c.playerId);
    const bHole = B.hole.map((c) => c.playerId);
    const allHole = [...aHole, ...bHole];
    expect(new Set(allHole).size).toBe(4); // 4 distinct hole players

    // result:best is a PRIVATE per-seat emit (toSeat) carrying the recipient's OWN
    // winning combination — which can include their own hole cards — so it is an
    // allowed private channel here, exactly like game:dealt. Cross-player leakage
    // via result:best (or anything else) is still caught by the per-player check
    // below, which forbids a client from ever seeing the OTHER player's hole cards.
    const isPrivateOrReveal = (ev: string) =>
      ev === "game:dealt" || ev === "result:best" || ev === "game:result";
    for (const c of [A, B]) {
      const dealt = c.events.filter((e) => e.event === "game:dealt");
      expect(dealt).toHaveLength(1); // each got exactly ONE private deal
      for (const e of c.events) {
        if (isPrivateOrReveal(e.event)) continue; // private per-seat channels + official reveal
        const json = JSON.stringify(e.payload ?? {});
        for (const id of allHole) {
          expect(json.includes(id)).toBe(false); // no hole card in any broadcast
        }
      }
    }
    // Cross-player privacy (the real leak check): across ALL of a client's events
    // except the official game:result reveal — INCLUDING its private result:best —
    // A must never contain any of B's hole cards, and vice versa. This still fails
    // if result:best (or any channel) ever leaked the OTHER player's private cards.
    const aSeen = JSON.stringify(A.events.filter((e) => e.event !== "game:result"));
    const bSeen = JSON.stringify(B.events.filter((e) => e.event !== "game:result"));
    for (const id of bHole) expect(aSeen.includes(id)).toBe(false);
    for (const id of aHole) expect(bSeen.includes(id)).toBe(false);

    // === ASSERTION 1b — OFFICIAL REVEAL at showdown ========================
    // game:result reveals BOTH contenders' hole cards to everyone, and names the
    // winning association (Arabic, from the DB).
    const resultPayload = A.events.find((e) => e.event === "game:result")!.payload as {
      results: Array<{ holeCards: Array<{ playerId: string }> | null }>;
      winningRankNameAr: string | null;
    };
    const revealedIds = resultPayload.results.flatMap((r) =>
      r.holeCards ? r.holeCards.map((c) => c.playerId) : [],
    );
    expect(new Set(revealedIds)).toEqual(new Set(allHole)); // all 4 contender cards revealed
    expect(typeof resultPayload.winningRankNameAr).toBe("string"); // winning association named

    // === ASSERTION 2 — WALLET LEDGER SETTLEMENT ============================
    for (const u of [userA, userB]) {
      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } });
      const agg = await prisma.walletTransaction.aggregate({
        where: { userId: u.id },
        _sum: { amount: true },
      });
      // balance is always exactly the ledger sum (Section 6 invariant)
      expect(wallet.balance).toBe(agg._sum.amount ?? 0n);
      // split with no forfeits ⇒ ante out, equal share back ⇒ net zero ⇒ 1000
      expect(wallet.balance).toBe(1000n);

      const txs = await prisma.walletTransaction.findMany({ where: { userId: u.id } });
      expect(txs.some((t) => t.type === "ANTE" && t.amount === -50n)).toBe(true);
      expect(txs.some((t) => t.type === "SPLIT_WIN" && t.amount === 50n)).toBe(true);
    }

    // === ASSERTION 3 — SERVER-AUTHORITATIVE OUTCOME =======================
    const finalGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(finalGame.status).toBe("ENDED");
    expect(finalGame.phase).toBe("ENDED");

    const results = await prisma.gameResult.findMany({ where: { gameId: game.id } });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.outcome === "SPLIT")).toBe(true);
    expect(results.every((r) => r.coinsDelta === 0n)).toBe(true);

    // Antes were persisted by the server (not the clients). Winner determination
    // is automatic now, so there is no self-declared claim step to persist.
    const bets = await prisma.bet.count({ where: { gameId: game.id, action: "ANTE" } });
    expect(bets).toBe(2);
  });
});
