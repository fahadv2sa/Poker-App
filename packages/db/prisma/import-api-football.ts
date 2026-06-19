/**
 * ONE-TIME, re-runnable importer that fills players / nationalities / clubs /
 * player_clubs from API-Football (direct api-sports.io). This is a STANDALONE
 * data-loading tool — it is NEVER called at gameplay time and touches no game
 * logic, engine, or rank rules. It only writes the data tables.
 *
 *   pnpm db:import-api-football                 # real import (current season)
 *   pnpm db:import-api-football --dry-run       # fetch + log counts, NO writes
 *   pnpm db:import-api-football --dry-run --sample=20   # cheap preview
 *   pnpm db:import-api-football --season=2025
 *   pnpm db:import-api-football --sample=50     # cap players (testing)
 *
 * Auth: reads API_FOOTBALL_KEY from the environment (packages/db/.env). The key
 * is NEVER hardcoded or committed. Idempotent: players upsert by `external_ref`
 * (the API player id), nationalities/clubs upsert by name, player_clubs links
 * reconciled — mirrors the seed-players upsert pattern. Resumable via a local
 * checkpoint file (gitignored).
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/client";

// --- config ---------------------------------------------------------------

const BASE = "https://v3.football.api-sports.io";
const DEFAULT_SEASON = 2025; // 2025/26; override with --season=

/** Top-5 European leagues → API-Football league ids. */
const LEAGUES: ReadonlyArray<{ name: string; id: number }> = [
  { name: "Premier League", id: 39 },
  { name: "La Liga", id: 140 },
  { name: "Serie A", id: 135 },
  { name: "Bundesliga", id: 78 },
  { name: "Ligue 1", id: 61 },
];

/** API-Football position words → this project's position codes. */
const POSITION_MAP: Record<string, "GK" | "DEF" | "MID" | "FWD"> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
};

const CHECKPOINT = resolve(process.cwd(), ".import-progress.json");

// --- args -----------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string, d: string) => {
  const a = argv.find((x) => x.startsWith(`${f}=`));
  return a ? a.slice(f.length + 1) : d;
};
const DRY_RUN = flag("--dry-run");
const SEASON = Number(opt("--season", String(DEFAULT_SEASON)));
const SAMPLE = Number(opt("--sample", "0")); // 0 = no limit on players
const MAX_PAGES = Number(opt("--max-pages", "0")); // 0 = all pages per league
const MIN_INTERVAL_MS = Number(opt("--interval", "250")); // ~240 req/min < 300
const DAILY_CAP = Number(opt("--daily", "7500")); // Pro tier daily budget

// --- minimal API typings --------------------------------------------------

interface ApiEnvelope<T> {
  response: T[];
  paging?: { current: number; total: number };
  errors?: unknown;
}
interface PlayerItem {
  player: {
    id: number;
    name: string;
    nationality: string | null;
    photo: string | null;
    birth?: { date: string | null } | null;
  };
  statistics?: Array<{ games?: { position?: string | null } | null }>;
}
interface TeamItem {
  team: { id: number; name: string };
}

// --- rate-limited fetch ---------------------------------------------------

class QuotaStop extends Error {}

let requestsMade = 0;
let lastRequestTs = 0;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<ApiEnvelope<T>> {
  if (requestsMade >= DAILY_CAP) {
    throw new QuotaStop(`Daily cap (${DAILY_CAP}) reached — re-run to resume.`);
  }
  // Throttle to stay under the per-minute limit.
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestTs);
  if (wait > 0) await sleep(wait);

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; attempt < 5; attempt++) {
    lastRequestTs = Date.now();
    requestsMade++;
    const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });

    // Provider tells us what's left; stop cleanly when the daily budget is gone.
    const dailyRemaining = res.headers.get("x-ratelimit-requests-remaining");
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1)); // per-minute throttle hit — back off
      continue;
    }
    if (res.status >= 500) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new Error(`API ${path} → HTTP ${res.status}`);
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
    if (dailyRemaining === "0") throw new QuotaStop("Daily quota exhausted (header).");
    return body;
  }
  throw new Error(`API ${path} failed after retries`);
}

// --- checkpoint -----------------------------------------------------------

interface Discovered {
  id: number;
  name: string;
  nationality: string | null;
  birthYear: number | null;
  photoUrl: string | null;
  /** position word → count, to pick the most frequent. */
  positions: Record<string, number>;
}
interface Checkpoint {
  season: number;
  pagesDone: Record<number, number>; // leagueId → last completed page
  leaguesDone: number[];
  discovered: Record<number, Discovered>;
  careerDone: number[]; // player ids already upserted with career clubs
}

function freshCheckpoint(): Checkpoint {
  return { season: SEASON, pagesDone: {}, leaguesDone: [], discovered: {}, careerDone: [] };
}
function loadCheckpoint(): Checkpoint {
  if (DRY_RUN || !existsSync(CHECKPOINT)) return freshCheckpoint();
  try {
    const cp = JSON.parse(readFileSync(CHECKPOINT, "utf8")) as Checkpoint;
    if (cp.season !== SEASON) return freshCheckpoint(); // different season → start over
    return cp;
  } catch {
    return freshCheckpoint();
  }
}
function saveCheckpoint(cp: Checkpoint) {
  if (DRY_RUN) return;
  writeFileSync(CHECKPOINT, JSON.stringify(cp));
}

// --- transforms -----------------------------------------------------------

function birthYearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

/** Most frequent mapped position code, or null if none resolvable. */
function primaryPosition(positions: Record<string, number>): "GK" | "DEF" | "MID" | "FWD" | null {
  let best: "GK" | "DEF" | "MID" | "FWD" | null = null;
  let bestCount = 0;
  for (const [word, count] of Object.entries(positions)) {
    const code = POSITION_MAP[word];
    if (code && count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

// --- main -----------------------------------------------------------------

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error(
      "API_FOOTBALL_KEY is not set. Put it in packages/db/.env (never commit it).",
    );
  }
  console.log(
    `API-Football import — season ${SEASON}${DRY_RUN ? " [DRY RUN: no writes]" : ""}` +
      `${SAMPLE ? ` [sample=${SAMPLE}]` : ""}`,
  );

  const positions = await prisma.position.findMany();
  const positionId = new Map(positions.map((p) => [p.code, p.id]));
  if (positionId.size < 4) throw new Error("Positions not seeded — run `pnpm db:seed` first.");

  const cp = loadCheckpoint();
  const natCache = new Map<string, string>();
  const clubCache = new Map<string, string>();

  let stopped = false;
  try {
    // ---- Phase 1: discover players + current-season position ----
    for (const league of LEAGUES) {
      if (cp.leaguesDone.includes(league.id)) continue;
      let page = (cp.pagesDone[league.id] ?? 0) + 1;
      let totalPages = page;
      do {
        const data = await apiGet<PlayerItem>(
          "/players",
          { league: league.id, season: SEASON, page },
          apiKey,
        );
        totalPages = data.paging?.total ?? page;
        for (const item of data.response) {
          const id = item.player.id;
          const d: Discovered =
            cp.discovered[id] ??
            ({
              id,
              name: item.player.name,
              nationality: item.player.nationality,
              birthYear: birthYearOf(item.player.birth?.date),
              photoUrl: item.player.photo,
              positions: {},
            } satisfies Discovered);
          for (const st of item.statistics ?? []) {
            const pos = st.games?.position;
            if (pos) d.positions[pos] = (d.positions[pos] ?? 0) + 1;
          }
          cp.discovered[id] = d;
        }
        cp.pagesDone[league.id] = page;
        saveCheckpoint(cp);
        console.log(
          `  ${league.name}: page ${page}/${totalPages} (${Object.keys(cp.discovered).length} players so far)`,
        );
        page++;
        if (MAX_PAGES && page > MAX_PAGES) break;
        if (SAMPLE && Object.keys(cp.discovered).length >= SAMPLE) break;
      } while (page <= totalPages);
      if (!MAX_PAGES && !(SAMPLE && Object.keys(cp.discovered).length >= SAMPLE)) {
        cp.leaguesDone.push(league.id);
        saveCheckpoint(cp);
      }
      if (SAMPLE && Object.keys(cp.discovered).length >= SAMPLE) break;
    }

    // ---- Phase 2: career clubs + upsert ----
    const careerDone = new Set(cp.careerDone);
    let all = Object.values(cp.discovered);
    if (SAMPLE) all = all.slice(0, SAMPLE);

    const counts = {
      imported: 0,
      skippedNoPosition: 0,
      clubs: new Set<string>(),
      nationalities: new Set<string>(),
      links: 0,
    };

    for (const d of all) {
      if (careerDone.has(d.id)) continue;

      const code = primaryPosition(d.positions);
      if (!code) {
        counts.skippedNoPosition++;
        careerDone.add(d.id);
        cp.careerDone = [...careerDone];
        saveCheckpoint(cp);
        continue;
      }

      const teamsData = await apiGet<TeamItem>("/players/teams", { player: d.id }, apiKey);
      const clubNames = [...new Set(teamsData.response.map((t) => t.team.name.trim()).filter(Boolean))];
      for (const c of clubNames) counts.clubs.add(c);
      if (d.nationality) counts.nationalities.add(d.nationality.trim());
      counts.links += clubNames.length;
      counts.imported++;

      if (!DRY_RUN) {
        await upsertPlayer(d, code, clubNames, positionId, natCache, clubCache);
      }
      careerDone.add(d.id);
      cp.careerDone = [...careerDone];
      saveCheckpoint(cp);

      if (counts.imported % 25 === 0) {
        console.log(`  career+upsert: ${counts.imported}/${all.length}`);
      }
    }

    console.log("\n==== SUMMARY ====");
    console.log(`players discovered : ${Object.keys(cp.discovered).length}`);
    console.log(`players ${DRY_RUN ? "to import" : "imported"} : ${counts.imported}`);
    console.log(`skipped (no position): ${counts.skippedNoPosition}`);
    console.log(`distinct clubs       : ${counts.clubs.size}`);
    console.log(`distinct nationalities: ${counts.nationalities.size}`);
    console.log(`player→club links    : ${counts.links}`);
    console.log(`API requests made    : ${requestsMade}`);
    if (DRY_RUN) console.log("DRY RUN — no database writes were performed.");
  } catch (err) {
    if (err instanceof QuotaStop) {
      stopped = true;
      console.warn(`\n⏸  Stopped: ${err.message}`);
      console.warn("   Progress saved — re-run the same command to resume.");
    } else {
      throw err;
    }
  }

  if (!stopped && !DRY_RUN) {
    console.log("\n✅ Import complete.");
  }
}

/** Idempotent upsert of one player + reconciled clubs (mirrors seed-players). */
async function upsertPlayer(
  d: Discovered,
  code: "GK" | "DEF" | "MID" | "FWD",
  clubNames: string[],
  positionId: Map<string, string>,
  natCache: Map<string, string>,
  clubCache: Map<string, string>,
) {
  // nationality upsert by name (dedupes against existing rows)
  let nationalityRowId: string | null = null;
  const nat = d.nationality?.trim();
  if (nat) {
    nationalityRowId =
      natCache.get(nat) ??
      (await prisma.nationality.upsert({ where: { name: nat }, update: {}, create: { name: nat } }))
        .id;
    natCache.set(nat, nationalityRowId);
  }
  // A player must have a nationality for the rank engine; skip if missing.
  if (!nationalityRowId) return;

  const data = {
    name: d.name,
    externalRef: d.id,
    nationalityId: nationalityRowId,
    positionId: positionId.get(code)!,
    birthYear: d.birthYear,
    photoUrl: d.photoUrl,
    active: true,
    // name_ar intentionally left as-is (null on create) — Arabic backfill later.
  };

  const existing = await prisma.player.findUnique({ where: { externalRef: d.id } });
  const player = existing
    ? await prisma.player.update({ where: { id: existing.id }, data })
    : await prisma.player.create({ data });

  // reconcile clubs (upsert by name, then clear + recreate the player's links)
  const clubIds: string[] = [];
  for (const name of clubNames) {
    const id =
      clubCache.get(name) ??
      (await prisma.club.upsert({ where: { name }, update: {}, create: { name } })).id;
    clubCache.set(name, id);
    clubIds.push(id);
  }
  await prisma.playerClub.deleteMany({ where: { playerId: player.id } });
  for (const clubId of clubIds) {
    await prisma.playerClub.create({ data: { playerId: player.id, clubId } });
  }
}

// Reusable helpers for the differential importer (differential-import.ts) and
// any future tooling — re-export the existing functions so the rate-limited
// fetch, position mapping, and player/club upsert logic are never duplicated.
export {
  apiGet,
  QuotaStop,
  requestsMade,
  birthYearOf,
  primaryPosition,
  POSITION_MAP,
  upsertPlayer,
};
export type { ApiEnvelope, PlayerItem, TeamItem, Discovered };

// Only auto-run the full season importer when this file is executed directly
// (pnpm db:import-api-football) — NOT when another script imports its helpers.
if (process.argv[1]?.endsWith("import-api-football.ts")) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
