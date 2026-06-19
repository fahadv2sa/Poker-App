/**
 * Smart DIFFERENTIAL importer. Updates the players table against a new
 * qualification rule using the current data as a base — ADDS only missing
 * qualified players, REMOVES only unqualified ones, and NEVER touches the
 * manually-seeded players (external_ref IS NULL).
 *
 *   pnpm db:diff-import              # Phase 1 (qualified set) + dry-run summary, NO writes
 *   pnpm db:diff-import --confirm    # also run Phase 2 (remove) + Phase 3 (add), resumable
 *
 * QUALIFY = >=1 appearance (games.appearences >= 1) in the first division of any
 * top-5 European league in any season 2015-2024.
 *
 * Reuses the season importer's helpers (apiGet rate-limiter, birthYearOf,
 * primaryPosition, upsertPlayer with its nationality/club upsert) — see
 * import-api-football.ts. Resumable via a gitignored progress file; rate-limited
 * (apiGet ~240/min < 300) with a HARD STOP at 7000 API calls per run.
 *
 * SCORE PRESERVATION: upsertPlayer only writes name/photo/birth/nationality/
 * position — never fame_score/tier/top5_league_seasons. Phase 3 only INSERTS
 * missing players (skips everyone already in the DB), so kept players are never
 * re-touched. New players insert with fame_score=null, tier=null, top5=0; run
 * `pnpm db:transliterate-names` then `pnpm db:calculate-scores` after the import
 * to backfill Arabic names and rescore the whole roster.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/client";
import {
  apiGet,
  birthYearOf,
  primaryPosition,
  QuotaStop,
  requestsMade,
  upsertPlayer,
  type Discovered,
  type TeamItem,
} from "./import-api-football";

// --- config ---------------------------------------------------------------

const LEAGUES = [39, 140, 78, 135, 61]; // PL, La Liga, Bundesliga, Serie A, Ligue 1 (this order)
const SEASONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]; // oldest -> newest
// Hard stop on API calls per run. Defaults to 7000 (cautious); pass --daily=N to
// raise it (e.g. --daily=75000 on the Ultra plan). The reused apiGet reads the
// same --daily flag from the shared args, so one flag lifts both caps.
const dailyFlag = process.argv.find((a) => a.startsWith("--daily="));
const HARD_CAP = dailyFlag ? Number(dailyFlag.split("=")[1]) : 7000;
const PROGRESS = resolve(process.cwd(), ".diff-import-progress.json");
const CONFIRM = process.argv.includes("--confirm");
const today = () => new Date().toISOString().slice(0, 10);
const capReached = () => requestsMade >= HARD_CAP;

/** Season-major traversal order: 2015 (all leagues) -> 2016 ... -> 2024. */
const COMBOS = SEASONS.flatMap((season) =>
  LEAGUES.map((league) => ({ key: `${league}-${season}`, league, season })),
);

// --- progress file --------------------------------------------------------

interface QualifiedRef {
  id: number;
  league: number;
  season: number;
}
interface Progress {
  phase: 1 | 2 | 3;
  completedCombinations: string[];
  qualifiedOrder: QualifiedRef[]; // first appearance per id, in season-major order
  targetAdd: number; // initial "to add" count, fixed once Phase 3 starts
  removedCount: number;
  addedCount: number;
  apiCallsThisRun: number;
  lastPosition: { league: number; season: number; playerId: number } | null;
  lastRunDate: string;
  status: "in_progress" | "awaiting_confirmation" | "completed";
}

function freshProgress(): Progress {
  return {
    phase: 1,
    completedCombinations: [],
    qualifiedOrder: [],
    targetAdd: 0,
    removedCount: 0,
    addedCount: 0,
    apiCallsThisRun: 0,
    lastPosition: null,
    lastRunDate: today(),
    status: "in_progress",
  };
}
function loadProgress(): Progress {
  if (existsSync(PROGRESS)) {
    try {
      const p = JSON.parse(readFileSync(PROGRESS, "utf8")) as Partial<Progress>;
      // Reset if it predates the season-major qualifiedOrder format.
      if (Array.isArray(p.qualifiedOrder)) return { ...freshProgress(), ...p } as Progress;
    } catch {
      /* fall through */
    }
  }
  return freshProgress();
}
function saveProgress(p: Progress) {
  p.apiCallsThisRun = requestsMade;
  p.lastRunDate = today();
  writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
}

// --- API typings (only the fields read here) ------------------------------

interface PlayerListItem {
  player: {
    id: number;
    name?: string | null;
    nationality?: string | null;
    photo?: string | null;
    birth?: { date?: string | null } | null;
  };
  statistics?: Array<{ games?: { appearences?: number | null; position?: string | null } | null }> | null;
}

/** Fetch a player's record, freshest first (2024) then their known qualifying
 *  season (guaranteed to contain a record) — at most 2 calls instead of a long
 *  2024->2015 scan, using the season we already discovered in Phase 1. */
async function fetchPlayer(id: number, qualifyingSeason: number, apiKey: string): Promise<PlayerListItem | undefined> {
  const seasons = qualifyingSeason === 2024 ? [2024] : [2024, qualifyingSeason];
  for (const season of seasons) {
    if (capReached()) break;
    const res = await apiGet<PlayerListItem>("/players", { id, season }, apiKey);
    if (res.response.length > 0) return res.response[0];
  }
  return undefined;
}

// --- main -----------------------------------------------------------------

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not set (packages/db/.env).");

  const p = loadProgress();
  const completed = new Set(p.completedCombinations);
  const seen = new Set(p.qualifiedOrder.map((q) => q.id));

  // ===== PHASE 1 — build the qualified set in season-major order (reads only) =====
  if (completed.size < COMBOS.length) {
    console.log(`Phase 1 — qualified-set build (season-major): ${completed.size}/${COMBOS.length} combinations done.`);
    try {
      for (const { key, league, season } of COMBOS) {
        if (completed.has(key)) continue;
        if (capReached()) throw new QuotaStop(`Hard cap ${HARD_CAP} reached this run.`);
        let page = 1;
        let totalPages = 1;
        do {
          if (capReached()) throw new QuotaStop(`Hard cap ${HARD_CAP} reached this run.`);
          const data = await apiGet<PlayerListItem>("/players", { league, season, page }, apiKey);
          totalPages = data.paging?.total ?? page;
          for (const item of data.response) {
            const appeared = (item.statistics ?? []).some((s) => (s.games?.appearences ?? 0) >= 1);
            if (appeared && !seen.has(item.player.id)) {
              seen.add(item.player.id);
              p.qualifiedOrder.push({ id: item.player.id, league, season });
            }
          }
          page++;
        } while (page <= totalPages);
        completed.add(key);
        p.completedCombinations = [...completed];
        p.phase = 1;
        p.status = "in_progress";
        saveProgress(p);
        console.log(`  ${key}: done — qualified so far ${p.qualifiedOrder.length} (API calls ${requestsMade})`);
      }
    } catch (err) {
      if (err instanceof QuotaStop) {
        saveProgress(p);
        console.warn(`\n⏸  ${err.message}\n   Progress saved — re-run to resume Phase 1.`);
        await prisma.$disconnect();
        return;
      }
      throw err;
    }
  }
  const qualifiedIds = new Set(p.qualifiedOrder.map((q) => q.id));
  console.log(`\nPhase 1 complete: ${qualifiedIds.size} qualified IDs across ${COMBOS.length} league-seasons.`);

  // ===== PHASE 4 — dry-run summary =====
  const dbPlayers = await prisma.player.findMany({
    where: { externalRef: { not: null } },
    select: { id: true, externalRef: true, name: true },
  });
  const dbRefs = new Set(dbPlayers.map((x) => x.externalRef!));
  const toRemove = dbPlayers.filter((x) => !qualifiedIds.has(x.externalRef!));
  const toAdd = p.qualifiedOrder.filter((q) => !dbRefs.has(q.id));
  const manualCount = await prisma.player.count({ where: { externalRef: null } });

  console.log("\n==== DRY-RUN SUMMARY (Phase 4) ====");
  console.log(`Total qualified player IDs (API)     : ${qualifiedIds.size}`);
  console.log(`DB players WITH external_ref         : ${dbPlayers.length}`);
  console.log(`Manual players (external_ref NULL)   : ${manualCount}  — never touched`);
  console.log(`To REMOVE (in DB, not qualified)     : ${toRemove.length}`);
  console.log(`To ADD (qualified, not in DB)        : ${toAdd.length}`);
  console.log(`To KEEP unchanged                    : ${dbPlayers.length - toRemove.length}`);
  console.log(`API calls this run                   : ${requestsMade}`);

  if (!CONFIRM) {
    p.status = "awaiting_confirmation";
    saveProgress(p);
    console.log("\n⏸  AWAITING CONFIRMATION — Phases 2 & 3 did NOT run.\n    Re-run to execute:  pnpm db:diff-import --confirm");
    await prisma.$disconnect();
    return;
  }

  // ===== PHASE 2 — remove unqualified (external_ref NOT NULL only); run once =====
  if (p.phase < 2) {
    console.log(`\nPhase 2 — removing ${toRemove.length} unqualified players (never the ${manualCount} manual NULL-ref ones)...`);
    let removed = 0;
    let removeSkipped = 0;
    for (const pl of toRemove) {
      try {
        await prisma.playerClub.deleteMany({ where: { playerId: pl.id } });
        await prisma.player.delete({ where: { id: pl.id } });
        removed++;
        console.log(`  - removed ${pl.name} (ref ${pl.externalRef})`);
      } catch (err) {
        removeSkipped++; // e.g. referenced by a played game's game_cards (FK Restrict)
        console.warn(`  ~ skip ${pl.name} (ref ${pl.externalRef}) — FK protected: ${(err as Error).message.split("\n")[0]}`);
      }
    }
    p.removedCount = removed;
    p.phase = 2;
    saveProgress(p);
    console.log(`Removed ${removed} players, skipped ${removeSkipped} (FK protected).`);
  } else {
    console.log(`\nPhase 2 already done in a previous run (removed ${p.removedCount}). Skipping.`);
  }

  // ===== PHASE 3 — add missing players, oldest season first, resumable =====
  if (p.targetAdd === 0) p.targetAdd = toAdd.length; // fix the denominator once
  saveProgress(p);

  if (toAdd.length === 0) {
    p.status = "completed";
    saveProgress(p);
    console.log("\nPhase 3 — nothing to add. ✅ Differential import complete.");
    await prisma.$disconnect();
    return;
  }

  const resumeAt = toAdd[0]!;
  console.log(
    `\nResuming from league ${resumeAt.league} season ${resumeAt.season} — ${p.addedCount} players added so far, ${requestsMade} API calls used`,
  );

  const positionsRows = await prisma.position.findMany();
  const positionId = new Map(positionsRows.map((r) => [r.code, r.id]));
  const natCache = new Map<string, string>();
  const clubCache = new Map<string, string>();

  let addedThisRun = 0;
  let skipped = 0;
  let cappedAt: QualifiedRef | null = null;
  let current: QualifiedRef | null = null;

  try {
  for (const q of toAdd) {
    current = q;
    if (capReached()) {
      cappedAt = q;
      break;
    }
    const item = await fetchPlayer(q.id, q.season, apiKey);
    if (!item) {
      skipped++;
      continue;
    }
    const positions: Record<string, number> = {};
    for (const s of item.statistics ?? []) {
      const pos = s.games?.position;
      if (pos) positions[pos] = (positions[pos] ?? 0) + 1;
    }
    const code = primaryPosition(positions);
    if (!code) {
      skipped++;
      continue;
    }
    const d: Discovered = {
      id: q.id,
      name: item.player.name ?? String(q.id),
      nationality: item.player.nationality ?? null,
      birthYear: birthYearOf(item.player.birth?.date),
      photoUrl: item.player.photo ?? null,
      positions,
    };
    // Full career clubs via /players/teams (matches existing data + reuses upsertPlayer).
    const teams = await apiGet<TeamItem>("/players/teams", { player: q.id }, apiKey);
    const clubNames = [...new Set(teams.response.map((t) => t.team.name.trim()).filter(Boolean))];

    await upsertPlayer(d, code, clubNames, positionId, natCache, clubCache); // inserts (new); never overwrites scores

    addedThisRun++;
    p.addedCount += 1;
    p.phase = 3;
    p.status = "in_progress";
    p.lastPosition = { league: q.league, season: q.season, playerId: q.id };
    saveProgress(p); // SAVE AFTER EVERY SINGLE PLAYER (per spec)
    console.log(`  + ${d.name} (ref ${q.id})`);
  }
  } catch (err) {
    // apiGet throws QuotaStop when the API's daily-quota header hits 0 (distinct
    // from the per-run HARD_CAP). Progress is already saved per player, so end
    // the run cleanly with the resume summary instead of crashing.
    if (err instanceof QuotaStop) {
      cappedAt = current;
      saveProgress(p);
    } else {
      throw err;
    }
  }

  const remaining = p.targetAdd - p.addedCount;
  if (cappedAt) {
    console.log(
      `\n⛔ Daily cap reached. Stopped after adding ${addedThisRun} new players.\n` +
        `   Last position: league ${cappedAt.league} season ${cappedAt.season} player ${cappedAt.id}\n` +
        `   Re-run tomorrow with: pnpm db:diff-import --confirm to continue`,
    );
  } else {
    p.status = "completed";
    saveProgress(p);
  }

  console.log("\n════════════════════════════════");
  console.log(` Run complete — ${today()}`);
  console.log(` Players removed:     ${p.removedCount} (one-time, already done)`);
  console.log(` Players added today: ${addedThisRun}${skipped ? ` (skipped ${skipped} with no usable record)` : ""}`);
  console.log(` Total added so far:  ${p.addedCount} / ${p.targetAdd}`);
  console.log(` Remaining to add:    ${remaining < 0 ? 0 : remaining}`);
  console.log(` API calls this run:  ${requestsMade}`);
  console.log(
    cappedAt
      ? ` Next resume point:   league ${cappedAt.league} season ${cappedAt.season}`
      : ` Next resume point:   none — import complete ✅`,
  );
  console.log(
    cappedAt
      ? ` Command to continue: pnpm db:diff-import --confirm`
      : ` Next: pnpm db:transliterate-names  then  pnpm db:calculate-scores`,
  );
  console.log("════════════════════════════════");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
