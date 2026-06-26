/**
 * ONE-TIME, re-runnable importer that fills the fame-score inputs from
 * API-Football: per-player big-tournament appearances (player_tournament_stats)
 * and top-5-league season counts (players.top5_league_seasons). STANDALONE data
 * tool — never called at gameplay time, touches no rank/engine/wallet logic.
 *
 *   pnpm db:import-tournament-stats                # full run (resumable)
 *   pnpm db:import-tournament-stats --dry-run      # fetch + log, NO writes
 *   pnpm db:import-tournament-stats --sample=20    # cap players (testing)
 *
 * COST: per player it calls /players/seasons once, then /players?id=&season=
 * per season (~6-10 each) → ~25-30k calls for the full set. API-Football Pro is
 * 300/min AND ~7,500/day, so a full run spans multiple days. It is idempotent
 * (upserts) and resumable via a gitignored checkpoint, so re-run until done.
 *
 * Auth: reads API_FOOTBALL_KEY from packages/db/.env. Never hardcoded.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { prisma } from "../src/client";

const BASE = "https://v3.football.api-sports.io";
// Checkpoint lives OUTSIDE OneDrive by DEFAULT (OS temp dir) — OneDrive locks
// frequently-written files → EBUSY mid-run. Override with TOURNAMENT_CHECKPOINT.
const CHECKPOINT = process.env.TOURNAMENT_CHECKPOINT ?? resolve(tmpdir(), "fb-tournament-progress.json");

// API-Football league ids for the tracked competitions.
const WORLD_CUP = 1;
const CHAMPIONS_LEAGUE = 2;
const EURO = 4;
const COPA_AMERICA = 9;
const TOP5 = new Set([39, 140, 135, 78, 61]); // PL, La Liga, Serie A, Bundesliga, Ligue 1

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string, d: string) => {
  const a = argv.find((x) => x.startsWith(`${f}=`));
  return a ? a.slice(f.length + 1) : d;
};
const DRY_RUN = flag("--dry-run");
const SAMPLE = Number(opt("--sample", "0"));
const MIN_INTERVAL_MS = Number(opt("--interval", "250")); // ~240/min < 300
const DAILY_CAP = Number(opt("--daily", "7500")); // Pro tier daily budget

// --- rate-limited fetch (mirrors the player importer) ---------------------

class QuotaStop extends Error {}
let requestsMade = 0;
let lastRequestTs = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ApiEnvelope<T> {
  response: T[];
  errors?: unknown;
}

async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<ApiEnvelope<T>> {
  if (requestsMade >= DAILY_CAP) throw new QuotaStop(`Daily cap (${DAILY_CAP}) reached — re-run to resume.`);
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestTs);
  if (wait > 0) await sleep(wait);

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; attempt < 5; attempt++) {
    lastRequestTs = Date.now();
    requestsMade++;
    const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status >= 500) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
    if (res.headers.get("x-ratelimit-requests-remaining") === "0") {
      throw new QuotaStop("Daily quota exhausted (header).");
    }
    const body = (await res.json()) as ApiEnvelope<T>;
    const errs = body.errors;
    const hasErrors =
      (Array.isArray(errs) && errs.length > 0) ||
      (errs != null && typeof errs === "object" && Object.keys(errs).length > 0);
    if (hasErrors) {
      const text = JSON.stringify(errs);
      if (/rate|limit|quota/i.test(text)) throw new QuotaStop(`API quota/limit: ${text}`);
      throw new Error(`API ${path} error: ${text}`);
    }
    return body;
  }
  throw new Error(`API ${path} failed after retries`);
}

// --- checkpoint -----------------------------------------------------------

interface Checkpoint {
  done: number[]; // external_refs already imported
}
function loadCheckpoint(): Checkpoint {
  if (DRY_RUN || !existsSync(CHECKPOINT)) return { done: [] };
  try {
    return JSON.parse(readFileSync(CHECKPOINT, "utf8")) as Checkpoint;
  } catch {
    return { done: [] };
  }
}
function saveCheckpoint(cp: Checkpoint) {
  if (DRY_RUN) return;
  // OneDrive / antivirus can briefly lock the checkpoint mid-write (EBUSY/EPERM).
  // Retry through a transient lock so it can't kill an otherwise-healthy run.
  for (let i = 0; ; i++) {
    try {
      writeFileSync(CHECKPOINT, JSON.stringify(cp));
      return;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if ((code === "EBUSY" || code === "EPERM") && i < 50) {
        const until = Date.now() + 100;
        while (Date.now() < until) {
          /* brief synchronous backoff */
        }
        continue;
      }
      throw e;
    }
  }
}

// --- API typings ----------------------------------------------------------

interface SeasonStat {
  league?: { id?: number | null } | null;
  games?: { appearences?: number | null } | null;
}
interface PlayerSeasonItem {
  statistics?: SeasonStat[] | null;
}

// --- core -----------------------------------------------------------------

async function importPlayer(
  ref: number,
  apiKey: string,
): Promise<{ worldCup: number; euroCopa: number; ucl: number; top5: number }> {
  const seasonsRes = await apiGet<number>("/players/seasons", { player: ref }, apiKey);
  const seasons = (seasonsRes.response ?? []).filter((s) => Number.isFinite(s));

  let worldCup = 0;
  let euroCopa = 0;
  let ucl = 0;
  const top5Seasons = new Set<number>();

  for (const season of seasons) {
    const res = await apiGet<PlayerSeasonItem>("/players", { id: ref, season }, apiKey);
    const stats = res.response[0]?.statistics ?? [];
    let wc = false;
    let ec = false;
    let cl = false;
    let t5 = false;
    for (const s of stats) {
      const lid = s.league?.id ?? -1;
      if ((s.games?.appearences ?? 0) <= 0) continue;
      if (lid === WORLD_CUP) wc = true;
      else if (lid === EURO || lid === COPA_AMERICA) ec = true;
      else if (lid === CHAMPIONS_LEAGUE) cl = true;
      else if (TOP5.has(lid)) t5 = true;
    }
    if (wc) worldCup++;
    if (ec) euroCopa++;
    if (cl) ucl++;
    if (t5) top5Seasons.add(season);
  }
  return { worldCup, euroCopa, ucl, top5: top5Seasons.size };
}

async function persist(
  playerId: string,
  c: { worldCup: number; euroCopa: number; ucl: number; top5: number },
) {
  const upsert = (tournamentType: "WORLD_CUP" | "EURO_COPA" | "CHAMPIONS_LEAGUE", appearances: number) =>
    prisma.playerTournamentStat.upsert({
      where: { playerId_tournamentType: { playerId, tournamentType } },
      update: { appearances },
      create: { playerId, tournamentType, appearances },
    });
  await prisma.$transaction([
    upsert("WORLD_CUP", c.worldCup),
    upsert("EURO_COPA", c.euroCopa),
    upsert("CHAMPIONS_LEAGUE", c.ucl),
    prisma.player.update({ where: { id: playerId }, data: { top5LeagueSeasons: c.top5 } }),
  ]);
}

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not set (packages/db/.env)");

  const cp = loadCheckpoint();
  const doneSet = new Set(cp.done);

  let players = await prisma.player.findMany({
    where: { active: true, externalRef: { not: null } },
    select: { id: true, name: true, externalRef: true },
    orderBy: { externalRef: "asc" },
  });
  if (SAMPLE) players = players.slice(0, SAMPLE);

  console.log(
    `Tournament-stats import${DRY_RUN ? " [DRY RUN: no writes]" : ""}` +
      `${SAMPLE ? ` [sample=${SAMPLE}]` : ""} — players: ${players.length}, already done: ${doneSet.size}`,
  );

  let imported = 0;
  try {
    for (const p of players) {
      const ref = p.externalRef!;
      if (doneSet.has(ref)) continue;

      const counts = await importPlayer(ref, apiKey);
      if (DRY_RUN) {
        console.log(
          `  ${p.name}: WC=${counts.worldCup} EuroCopa=${counts.euroCopa} UCL=${counts.ucl} top5=${counts.top5}`,
        );
      } else {
        await persist(p.id, counts);
        doneSet.add(ref);
        cp.done = [...doneSet];
        saveCheckpoint(cp);
      }
      imported++;
      if (imported % 25 === 0) console.log(`  progress: ${imported} players (${requestsMade} API calls)`);
    }
  } catch (err) {
    if (err instanceof QuotaStop) {
      console.log(`\n⏸  ${err.message} Progress saved (${doneSet.size} done). Re-run to continue.`);
    } else {
      throw err;
    }
  }

  console.log("\n==== SUMMARY ====");
  console.log(`players processed this run : ${imported}`);
  console.log(`total done                 : ${doneSet.size}/${players.length}`);
  console.log(`API requests this run      : ${requestsMade}`);
  console.log(
    DRY_RUN
      ? "DRY RUN — no database writes were performed."
      : doneSet.size >= players.length
        ? "✅ Import complete. Run pnpm db:calculate-scores to fold these in."
        : "Partial — re-run to resume (idempotent).",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
