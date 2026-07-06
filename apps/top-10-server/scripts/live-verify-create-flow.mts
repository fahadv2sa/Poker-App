/**
 * LIVE verification of the create-after-quick-play fix against the REAL running
 * top-10-server (real auth, real DB, real catalog). Two real accounts:
 *
 *   1. A + B queue for quick play → matched into the same live table.
 *   2. A "navigates away" (socket drop → 5-min grace holds the seat).
 *   3. A immediately creates a room (fresh nonce, like the create form).
 *   4. MUST land in a fresh WAITING LOBBY with a NEW invite code — never the
 *      old live table. B keeps playing at the old table.
 *
 * Usage: pnpm tsx --env-file=.env.local scripts/live-verify-create-flow.mts
 */
import { SignJWT } from "jose";
import { io as ioc, type Socket } from "socket.io-client";

const PORT = Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? 4100);
const URL = `http://localhost:${PORT}`;
const SECRET = process.env.AUTH_SECRET;
if (!SECRET) throw new Error("AUTH_SECRET missing — run with --env-file=.env.local");
const key = new TextEncoder().encode(SECRET);

// Real local accounts (platform.users) — activity freshly bumped.
const USER_A = { id: "8e72e9ac-1f5f-4a0a-ba82-968d4968dcf2", username: "Fahad", playerNumber: 100053 };
const USER_B = { id: "67b05bdb-9867-4d1a-a04b-9dc64dd0af58", username: "FHD", playerNumber: 100054 };

async function token(u: typeof USER_A): Promise<string> {
  return await new SignJWT({ username: u.username, playerNumber: u.playerNumber })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

type State = {
  matchId: string;
  kind: string;
  status: string;
  inviteCode: string | null;
  seats: Array<{ userId: string; username: string }>;
  roundNo: number;
};

type Client = Socket & { states: State[] };

async function connect(u: typeof USER_A): Promise<Client> {
  const c = ioc(URL, { auth: { token: await token(u) }, transports: ["websocket"], forceNew: true }) as Client;
  c.states = [];
  c.on("tt:state", (s: State) => c.states.push(s));
  await new Promise<void>((res, rej) => {
    c.once("connect", () => res());
    c.once("connect_error", (e) => rej(e));
  });
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitState(c: Client, pred: (s: State) => boolean, what: string, timeoutMs = 30000): Promise<State> {
  const hit = [...c.states].reverse().find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${what}`)), timeoutMs);
    const on = (s: State) => {
      if (!pred(s)) return;
      clearTimeout(t);
      c.off("tt:state", on);
      res(s);
    };
    c.on("tt:state", on);
  });
}

const emitAck = <T>(c: Socket, ev: string, payload: unknown): Promise<T> =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout: ${ev} ack`)), 10000);
    c.emit(ev, payload, (r: T) => {
      clearTimeout(t);
      res(r);
    });
  });

let failed = false;
function check(cond: boolean, label: string): void {
  console.log(`${cond ? "  ✔" : "  ✘ FAIL:"} ${label}`);
  if (!cond) failed = true;
}

const a1 = await connect(USER_A);
const b = await connect(USER_B);
console.log("① both accounts connected — queueing for quick play (EASY)…");
a1.emit("tt:queueJoin", { difficulty: "EASY" });
b.emit("tt:queueJoin", { difficulty: "EASY" });

const live = await waitState(a1, (s) => s.status === "IN_PROGRESS", "quick-play match start", 30000);
const oldId = live.matchId;
check(live.kind === "QUICK_PLAY", `matched into a live quick-play table (${oldId.slice(0, 8)}…, round ${live.roundNo})`);
check(live.seats.some((s) => s.userId === USER_B.id), "both accounts seated at the same table");

console.log("② A navigates away mid-round (socket drop → seat grace-held)…");
a1.disconnect();
await sleep(1500);

console.log("③ A comes back and immediately CREATES a room (fresh nonce)…");
const a2 = await connect(USER_A);
await sleep(300); // let the connection-handler resync of the OLD table land first (the trap)
const resynced = a2.states.find((s) => s.matchId === oldId);
check(!!resynced, "on reconnect the server still resyncs the old LIVE table (seat is grace-held — the trap is armed)");

const nonce = "live-" + Math.random().toString(36).slice(2, 10);
const ack = await emitAck<{ matchId?: string; inviteCode?: string | null; error?: string }>(a2, "tt:create", {
  difficulty: "MEDIUM",
  isPrivate: false,
  roomName: "طاولة التحقق",
  maxPlayers: 4,
  nonce,
});
check(!ack.error, `create acked without error${ack.error ? ` (got ${ack.error})` : ""}`);
check(ack.matchId !== oldId, "create did NOT return the old live table");
check(!!ack.inviteCode, `create returned a NEW invite code: ${ack.inviteCode}`);

const lobby = await waitState(a2, (s) => s.matchId === ack.matchId, "fresh room snapshot", 10000);
check(lobby.status === "LOBBY", "landed in a WAITING LOBBY (not mid-round)");
check(lobby.kind === "MANUAL", "fresh room is a MANUAL room");
check(lobby.roundNo === 0, "no round in progress in the new lobby");
check(lobby.seats.length === 1 && lobby.seats[0]!.userId === USER_A.id, "A is alone in the fresh lobby");
await sleep(600);
check(a2.states[a2.states.length - 1]!.status === "LOBBY", "…and it STAYS a lobby (nothing auto-starts)");

console.log("④ reload of the same create deep-link (SAME nonce) must resync, not duplicate…");
const ack2 = await emitAck<{ matchId?: string }>(a2, "tt:create", { difficulty: "MEDIUM", nonce });
check(ack2.matchId === ack.matchId, "same nonce → same room (reload protection intact)");

console.log("⑤ B is unaffected at the old table…");
const bLast = b.states[b.states.length - 1]!;
check(bLast.matchId === oldId, "B's latest snapshot is still the old table");

// cleanup: leave everything so no rooms linger on the dev server
a2.emit("tt:leave");
b.emit("tt:leave");
await sleep(400);
a2.disconnect();
b.disconnect();

console.log(failed ? "\nRESULT: FAILED" : "\nRESULT: ALL LIVE CHECKS PASSED");
process.exit(failed ? 1 : 0);
