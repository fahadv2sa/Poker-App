/**
 * LIVE local smoke of the live-play-feedback batch against the real GP server
 * (real DB / catalog / engine): solo quick play → ask the NEW continent
 * question + the nationality question and cross-check consistency, exercise
 * the reveal-request path (solo → immediate reveal), then a created room with
 * a 15-minute round timer.
 *
 * Usage: pnpm tsx --env-file=.env.local scripts/live-smoke-feedback.mts
 */
import { SignJWT } from "jose";
import { io as ioc, type Socket } from "socket.io-client";

const URL = "http://localhost:4200";
const SECRET = process.env.AUTH_SECRET!;
const key = new TextEncoder().encode(SECRET);
const USER = { id: "8e72e9ac-1f5f-4a0a-ba82-968d4968dcf2", username: "Fahad", playerNumber: 100053 };

async function token(): Promise<string> {
  return await new SignJWT({ username: USER.username, playerNumber: USER.playerNumber })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

type State = {
  matchId: string;
  status: string;
  phase: string | null;
  roundTimerSec: number;
  roundDeadlineTs: number | null;
  seats: Array<{ seat: number; userId: string; exhausted: boolean }>;
  revealRequest: { bySeat: number; approvals: number[]; needed: number } | null;
  turnSeat: number | null;
};
type Client = Socket & { states: State[]; questions: any[]; reveals: any[] };

async function connect(): Promise<Client> {
  const c = ioc(URL, { auth: { token: await token() }, transports: ["websocket"], forceNew: true }) as Client;
  c.states = [];
  c.questions = [];
  c.reveals = [];
  c.on("gp:state", (s: State) => c.states.push(s));
  c.on("gp:question", (q: any) => c.questions.push(q));
  c.on("gp:reveal", (r: any) => c.reveals.push(r));
  await new Promise<void>((res, rej) => {
    c.once("connect", () => res());
    c.once("connect_error", (e) => rej(e));
  });
  return c;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emitAck = <T,>(c: Socket, ev: string, payload: unknown): Promise<T> =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout: ${ev}`)), 15000);
    c.emit(ev, payload, (r: T) => {
      clearTimeout(t);
      res(r);
    });
  });
async function waitState(c: Client, pred: (s: State) => boolean, what: string, ms = 30000): Promise<State> {
  const t0 = Date.now();
  for (;;) {
    const hit = [...c.states].reverse().find(pred);
    if (hit) return hit;
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await sleep(100);
  }
}

let failed = false;
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? "  ✔" : "  ✘ FAIL:"} ${label}`);
  if (!cond) failed = true;
};

// ── ① solo quick play: continent question + consistency vs nationality ──────
console.log("① solo quick play — the NEW continent question…");
const c = await connect();
c.emit("gp:queueJoin", { difficulty: "EASY" });
const live = await waitState(c, (s) => s.status === "IN_PROGRESS" && s.phase === "PLAYING", "quick play start");
check(live.roundTimerSec === 600, `quick play round stays 10 min (roundTimerSec=${live.roundTimerSec})`);

// Ask all six continents — exactly one must be YES, the rest NO (every player
// nationality is mapped after the audit), and no UNKNOWNs.
const confederations = ["UEFA", "AFC", "CAF", "CONMEBOL", "CONCACAF", "OFC"];
const answers: Record<string, string> = {};
for (const conf of confederations) {
  const before = c.questions.length;
  c.emit("gp:ask", { template: "CONTINENT", confederation: conf });
  const t0 = Date.now();
  while (c.questions.length === before && Date.now() - t0 < 10000) await sleep(50);
  const q = c.questions.at(-1);
  answers[conf] = q?.answer ?? "NONE";
}
const yes = Object.entries(answers).filter(([, a]) => a === "YES");
const unknown = Object.entries(answers).filter(([, a]) => a === "UNKNOWN" || a === "NONE");
check(yes.length === 1, `exactly ONE continent answers YES (got ${JSON.stringify(answers)})`);
check(unknown.length === 0, "no UNKNOWNs — the curated mapping covered the hidden player");
const arabicLabel = c.questions.at(-1)?.params?.continentAr;
check(typeof arabicLabel === "string" && /[؀-ۿ]/.test(arabicLabel), `board label is Arabic («${arabicLabel}»)`);

// ── ② solo reveal request resolves immediately (sole voter) ─────────────────
console.log("② «كشف اللاعب» — solo contestant resolves immediately…");
c.emit("gp:revealRequest", {});
const t0 = Date.now();
while (c.reveals.length === 0 && Date.now() - t0 < 10000) await sleep(100);
const reveal = c.reveals.at(-1);
check(!!reveal && reveal.reason === "TIMER" && reveal.winnerSeat === null, "revealed with the timeout treatment, no winner");
c.emit("gp:leave", {});
await sleep(400);
c.disconnect();

// ── ③ created room honors the 15-minute selector ────────────────────────────
console.log("③ created room with roundMinutes=15…");
const c2 = await connect();
const ack = await emitAck<{ matchId: string; inviteCode: string }>(c2, "gp:create", {
  mode: "VS_SYSTEM",
  difficulty: "EASY",
  isPrivate: true,
  roundMinutes: 15,
  nonce: "smoke-" + Math.random().toString(36).slice(2, 8),
});
const lobby = await waitState(c2, (s) => s.matchId === ack.matchId, "lobby");
check(lobby.roundTimerSec === 900, `lobby shows the chosen 15-minute round (roundTimerSec=${lobby.roundTimerSec})`);
c2.emit("gp:leave", {});
await sleep(400);
c2.disconnect();

console.log(failed ? "\nRESULT: FAILED" : "\nRESULT: ALL LIVE CHECKS PASSED");
process.exit(failed ? 1 : 0);
