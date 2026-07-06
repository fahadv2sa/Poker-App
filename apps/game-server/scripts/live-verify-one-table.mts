/**
 * LIVE verification of L-1 (one table at a time) against the REAL running
 * game-server (real auth, real DB, real wallets). Two real accounts:
 *
 *   1. Two manual rooms A and B are created (as POST /api/rooms would).
 *   2. Fahad joins A (tab 1). FHD joins A too.
 *   3. Fahad "opens a second tab" and joins B → his seat in A must be
 *      released via the normal leave path: FHD sees player:left + host
 *      transfer, tab 1 gets room:closed SEAT_RELEASED (and stays connected).
 *   4. Single-tab variant: FHD navigates away from A (grace-held), then
 *      joins B → his grace-held A seat is released; A (now empty) closes.
 *
 * Usage: pnpm tsx --env-file=.env.local scripts/live-verify-one-table.mts
 */
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { io as ioc, type Socket } from "socket.io-client";
import { Prisma, prisma } from "@fb/db";
import { DEFAULT_GAME_CONFIG } from "@fb/shared";

const PORT = Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? 4000);
const URL = `http://localhost:${PORT}`;
const SECRET = process.env.AUTH_SECRET;
if (!SECRET) throw new Error("AUTH_SECRET missing — run with --env-file=.env.local");
const key = new TextEncoder().encode(SECRET);

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

const inviteCode = () =>
  randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 8).toUpperCase();

/** Create a manual Game row exactly as POST /api/rooms does. */
async function createRoom(name: string, createdBy: string): Promise<string> {
  const game = await prisma.game.create({
    data: {
      roomName: name,
      isPrivate: true,
      maxPlayers: 6,
      difficulty: "MEDIUM",
      inviteCode: inviteCode(),
      createdBy,
      config: { ...DEFAULT_GAME_CONFIG } as unknown as Prisma.InputJsonValue,
    },
    select: { inviteCode: true },
  });
  return game.inviteCode;
}

type Client = Socket & { states: any[]; closed: string[]; left: any[] };

async function connect(u: typeof USER_A): Promise<Client> {
  const c = ioc(URL, { auth: { token: await token(u) }, transports: ["websocket"], forceNew: true }) as Client;
  c.states = [];
  c.closed = [];
  c.left = [];
  c.on("state:sync", (s: any) => c.states.push(s));
  c.on("room:closed", (p: any) => c.closed.push(p.reason));
  c.on("player:left", (p: any) => c.left.push(p));
  await new Promise<void>((res, rej) => {
    c.once("connect", () => res());
    c.once("connect_error", (e) => rej(e));
  });
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function join(c: Client, code: string): Promise<any> {
  const before = c.states.length;
  c.emit("room:join", { inviteCode: code });
  for (let i = 0; i < 60; i++) {
    const hit = c.states.slice(before).find((s) => s.yourSeat !== null);
    if (hit) return hit;
    await sleep(50);
  }
  throw new Error(`timeout joining ${code}`);
}

let failed = false;
function check(cond: boolean, label: string): void {
  console.log(`${cond ? "  ✔" : "  ✘ FAIL:"} ${label}`);
  if (!cond) failed = true;
}

const codeA = await createRoom("طاولة أ — تحقق", USER_A.id);
const codeB = await createRoom("طاولة ب — تحقق", USER_A.id);
console.log(`① rooms created: A=${codeA} B=${codeB}`);

const fahadTab1 = await connect(USER_A);
await join(fahadTab1, codeA);
const fhd = await connect(USER_B);
const fhdSeatSnap = await join(fhd, codeA);
const fhdSeat = fhdSeatSnap.yourSeat;
check(true, "Fahad + FHD seated at table A");

console.log("② Fahad opens a second tab and joins table B (multi-tab)…");
const fahadTab2 = await connect(USER_A);
const snapB = await join(fahadTab2, codeB);
await sleep(400);
check(snapB.roomName?.includes("ب"), "Fahad is seated at table B");
check(fahadTab1.closed.includes("SEAT_RELEASED"), "tab 1 was told the seat moved (room:closed SEAT_RELEASED)");
check(fahadTab1.connected, "tab 1's socket stayed connected (no reconnect ping-pong)");
check(fhd.left.length === 1, "FHD saw Fahad leave table A (player:left)");
// The post-release broadcast is a room-wide sync (yourSeat null) — compare the
// host seat against FHD's seat captured at join time.
const fhdLast = fhd.states[fhd.states.length - 1];
check(fhdLast?.hostSeat === fhdSeat, "host transferred to FHD at table A");

console.log("③ single-tab flow: FHD navigates away from A (grace), then joins B…");
fhd.disconnect();
await sleep(500);
const fhd2 = await connect(USER_B);
await join(fhd2, codeB);
await sleep(600);
const gameA = await prisma.game.findUnique({ where: { inviteCode: codeA }, select: { status: true } });
check(gameA?.status === "ABANDONED", `table A auto-closed once emptied (status=${gameA?.status})`);

// cleanup: leave table B and close it out
fahadTab2.emit("room:leave", {});
fhd2.emit("room:leave", {});
await sleep(500);
const gameB = await prisma.game.findUnique({ where: { inviteCode: codeB }, select: { status: true } });
check(gameB?.status === "ABANDONED", `table B closed after both left (status=${gameB?.status})`);

fahadTab1.disconnect();
fahadTab2.disconnect();
fhd2.disconnect();
await prisma.$disconnect();
console.log(failed ? "\nRESULT: FAILED" : "\nRESULT: ALL LIVE CHECKS PASSED");
process.exit(failed ? 1 : 0);
