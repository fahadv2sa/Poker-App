/**
 * Player ENRICHMENT importer (LOCAL data tool — never touches game logic, engine,
 * wallet, or card privacy). For every player we already have (matched by
 * `external_ref` = the API-Football player id) it pulls the FULL API payload and
 * stores everything we previously discarded, classified into OUR structure:
 *   - STATIC per-player data (firstname, lastname, full birth date/place/country,
 *     height, weight) → columns on `players`, written ONCE per player.
 *   - SEASON/COMPETITION-dependent stats (the entire statistics[] object, every
 *     nested field flattened) → `player_season_stats`, one row per
 *     (player, season, competition, team) — never a single fixed number.
 *
 *   pnpm db:import-player-data                # real run, resumable
 *   pnpm db:import-player-data --dry-run      # fetch + log, NO writes
 *   pnpm db:import-player-data --sample=20    # cap players (testing)
 *   pnpm db:import-player-data --daily=100000 # raise the soft cap (header still rules)
 *
 * Runs until the API DAILY LIMIT is reached — apiGet stops on the provider's
 * `x-ratelimit-requests-remaining: 0` header (or the --daily soft cap), throwing
 * QuotaStop — then exits cleanly with progress saved. Re-run to resume.
 * Idempotent: static fields overwrite; a season's stat rows are replaced
 * (delete+insert) when that season is re-fetched. Resumable per (player, season)
 * via a gitignored checkpoint.
 *
 * Auth: API_FOOTBALL_KEY from packages/db/.env (never hardcoded/committed).
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { prisma } from "../src/client";
import { apiGet, QuotaStop, requestsMade } from "./import-api-football";

const BASE = "https://v3.football.api-sports.io";
// Checkpoint lives OUTSIDE OneDrive by DEFAULT (OS temp dir) — OneDrive locks
// frequently-written files → EBUSY mid-run. Override with ENRICH_CHECKPOINT.
const CHECKPOINT = process.env.ENRICH_CHECKPOINT ?? resolve(tmpdir(), "fb-enrich-progress.json");

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string, d: string) => {
  const a = argv.find((x) => x.startsWith(`${f}=`));
  return a ? a.slice(f.length + 1) : d;
};
const DRY_RUN = flag("--dry-run");
const SAMPLE = Number(opt("--sample", "0"));

// --- API payload shapes (only the fields we read) -------------------------

interface PlayerProfile {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
  birth?: { date?: string | null; place?: string | null; country?: string | null } | null;
  height?: string | null; // e.g. "180 cm"
  weight?: string | null; // e.g. "75 kg"
}
interface StatBlock {
  team?: { id?: number | null; name?: string | null; logo?: string | null } | null;
  league?: {
    id?: number | null;
    name?: string | null;
    country?: string | null;
    logo?: string | null;
    flag?: string | null;
  } | null;
  games?: {
    appearences?: number | null;
    lineups?: number | null;
    minutes?: number | null;
    number?: number | null;
    position?: string | null;
    rating?: string | null;
    captain?: boolean | null;
  } | null;
  substitutes?: { in?: number | null; out?: number | null; bench?: number | null } | null;
  shots?: { total?: number | null; on?: number | null } | null;
  goals?: { total?: number | null; conceded?: number | null; assists?: number | null; saves?: number | null } | null;
  passes?: { total?: number | null; key?: number | null; accuracy?: number | null } | null;
  tackles?: { total?: number | null; blocks?: number | null; interceptions?: number | null } | null;
  duels?: { total?: number | null; won?: number | null } | null;
  dribbles?: { attempts?: number | null; success?: number | null; past?: number | null } | null;
  fouls?: { drawn?: number | null; committed?: number | null } | null;
  cards?: { yellow?: number | null; yellowred?: number | null; red?: number | null } | null;
  penalty?: {
    won?: number | null;
    commited?: number | null; // API's spelling
    scored?: number | null;
    missed?: number | null;
    saved?: number | null;
  } | null;
}
interface PlayerSeasonItem {
  player: PlayerProfile;
  statistics?: StatBlock[];
}

// --- parse helpers --------------------------------------------------------

const toInt = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};
const toFloat = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** "180 cm" / "75 kg" → 180 / 75. */
const measure = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

// --- checkpoint -----------------------------------------------------------

interface Progress {
  done: number[]; // externalRefs fully enriched
  seasons: Record<string, number[]>; // externalRef → seasons already stored (in-progress players)
}
const loadProgress = (): Progress => {
  if (DRY_RUN || !existsSync(CHECKPOINT)) return { done: [], seasons: {} };
  try {
    return JSON.parse(readFileSync(CHECKPOINT, "utf8")) as Progress;
  } catch {
    return { done: [], seasons: {} };
  }
};
const saveProgress = (p: Progress) => {
  if (DRY_RUN) return;
  // OneDrive / antivirus can briefly lock the checkpoint mid-write (EBUSY/EPERM).
  // Retry through a transient lock so it can't kill an otherwise-healthy run.
  for (let i = 0; ; i++) {
    try {
      writeFileSync(CHECKPOINT, JSON.stringify(p));
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
};

// --- quota status (for reporting; /status does not count against the quota) --

async function apiStatus(apiKey: string) {
  try {
    const r = await fetch(`${BASE}/status`, { headers: { "x-apisports-key": apiKey } });
    const j = (await r.json()) as {
      response?: {
        requests?: { current?: number; limit_day?: number };
        subscription?: { plan?: string };
      };
    };
    return j.response ?? null;
  } catch {
    return null;
  }
}

// --- writes ---------------------------------------------------------------

async function writeStatic(playerId: string, p: PlayerProfile, existingBirthYear: number | null) {
  const birthDate = p.birth?.date ?? null;
  // The API occasionally ships malformed dates (e.g. "1975-16-12" — month 16,
  // day/month transposed, seen on player 113880). An Invalid Date would fail
  // Prisma validation and kill the whole run; store null instead — the raw
  // response is archived, so nothing is lost if we fix these later.
  const birthDateObj = birthDate ? new Date(birthDate) : null;
  const validBirthDate =
    birthDateObj && !Number.isNaN(birthDateObj.getTime()) ? birthDateObj : null;
  await prisma.player.update({
    where: { id: playerId },
    data: {
      firstName: p.firstname ?? undefined,
      lastName: p.lastname ?? undefined,
      birthDate: validBirthDate ?? undefined,
      birthPlace: p.birth?.place ?? undefined,
      birthCountry: p.birth?.country ?? undefined,
      heightCm: measure(p.height) ?? undefined,
      weightKg: measure(p.weight) ?? undefined,
      // Backfill birth_year only if we didn't already have it.
      birthYear:
        existingBirthYear == null && birthDate ? Number(birthDate.slice(0, 4)) || undefined : undefined,
    },
  });
}

/** Replace this season's stat rows (idempotent on re-fetch). Returns rows written. */
async function writeSeason(playerId: string, season: number, stats: StatBlock[]): Promise<number> {
  await prisma.playerSeasonStat.deleteMany({ where: { playerId, season } });
  if (stats.length === 0) return 0;
  const rows = stats.map((s) => ({
    playerId,
    season,
    teamId: toInt(s.team?.id),
    teamName: s.team?.name ?? null,
    teamLogo: s.team?.logo ?? null,
    leagueId: toInt(s.league?.id),
    leagueName: s.league?.name ?? null,
    leagueCountry: s.league?.country ?? null,
    leagueLogo: s.league?.logo ?? null,
    leagueFlag: s.league?.flag ?? null,
    appearances: toInt(s.games?.appearences),
    lineups: toInt(s.games?.lineups),
    minutes: toInt(s.games?.minutes),
    shirtNumber: toInt(s.games?.number),
    position: s.games?.position ?? null,
    rating: toFloat(s.games?.rating),
    captain: s.games?.captain ?? null,
    subsIn: toInt(s.substitutes?.in),
    subsOut: toInt(s.substitutes?.out),
    subsBench: toInt(s.substitutes?.bench),
    shotsTotal: toInt(s.shots?.total),
    shotsOn: toInt(s.shots?.on),
    goalsTotal: toInt(s.goals?.total),
    goalsConceded: toInt(s.goals?.conceded),
    goalsAssists: toInt(s.goals?.assists),
    goalsSaves: toInt(s.goals?.saves),
    passesTotal: toInt(s.passes?.total),
    passesKey: toInt(s.passes?.key),
    passesAccuracy: toInt(s.passes?.accuracy),
    tacklesTotal: toInt(s.tackles?.total),
    tacklesBlocks: toInt(s.tackles?.blocks),
    tacklesInterceptions: toInt(s.tackles?.interceptions),
    duelsTotal: toInt(s.duels?.total),
    duelsWon: toInt(s.duels?.won),
    dribblesAttempts: toInt(s.dribbles?.attempts),
    dribblesSuccess: toInt(s.dribbles?.success),
    dribblesPast: toInt(s.dribbles?.past),
    foulsDrawn: toInt(s.fouls?.drawn),
    foulsCommitted: toInt(s.fouls?.committed),
    cardsYellow: toInt(s.cards?.yellow),
    cardsYellowRed: toInt(s.cards?.yellowred),
    cardsRed: toInt(s.cards?.red),
    penaltyWon: toInt(s.penalty?.won),
    penaltyCommitted: toInt(s.penalty?.commited),
    penaltyScored: toInt(s.penalty?.scored),
    penaltyMissed: toInt(s.penalty?.missed),
    penaltySaved: toInt(s.penalty?.saved),
  }));
  await prisma.playerSeasonStat.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

// --- main -----------------------------------------------------------------

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not set. Put it in packages/db/.env (never commit it).");

  const startStatus = await apiStatus(apiKey);
  const limitDay = startStatus?.requests?.limit_day ?? null;
  const usedStart = startStatus?.requests?.current ?? null;
  console.log(
    `Plan: ${startStatus?.subscription?.plan ?? "?"} — daily quota ${usedStart ?? "?"}/${limitDay ?? "?"} used before this run.` +
      `${DRY_RUN ? " [DRY RUN: no writes]" : ""}${SAMPLE ? ` [sample=${SAMPLE}]` : ""}`,
  );

  const progress = loadProgress();
  const doneSet = new Set(progress.done);

  // Players we can enrich (have an API id). Prioritize those with NO season stats
  // yet (truly incomplete) first, then by id for stable resume order.
  const players = await prisma.player.findMany({
    where: { externalRef: { not: null } },
    select: { id: true, externalRef: true, birthYear: true },
  });
  const withStats = new Set(
    (await prisma.playerSeasonStat.findMany({ distinct: ["playerId"], select: { playerId: true } })).map(
      (r) => r.playerId,
    ),
  );
  players.sort(
    (a, b) =>
      Number(withStats.has(a.id)) - Number(withStats.has(b.id)) || a.externalRef! - b.externalRef!,
  );
  const queue = SAMPLE ? players.slice(0, SAMPLE) : players;

  let playersTouched = 0;
  let seasonRows = 0;
  let staticUpdates = 0;
  let stopped = false;
  const failedRefs: number[] = [];

  try {
    for (const pl of queue) {
      const ext = pl.externalRef!;
      if (doneSet.has(ext)) continue;
      try {
      const seasonsStored = new Set(progress.seasons[String(ext)] ?? []);

      // 1) which seasons does this player have data for?
      const seasonsResp = await apiGet<number>("/players/seasons", { player: ext }, apiKey);
      const seasons = (seasonsResp.response ?? []).filter((s) => Number.isFinite(s));

      let staticWritten = false;
      // 2) fetch each not-yet-stored season → static (once) + season stat rows
      for (const season of seasons) {
        if (seasonsStored.has(season)) continue;
        const resp = await apiGet<PlayerSeasonItem>("/players", { id: ext, season }, apiKey);
        const item = resp.response?.[0];
        if (item) {
          if (!staticWritten && !DRY_RUN) {
            await writeStatic(pl.id, item.player, pl.birthYear);
            staticUpdates++;
            staticWritten = true;
          }
          if (!DRY_RUN) seasonRows += await writeSeason(pl.id, season, item.statistics ?? []);
        }
        seasonsStored.add(season);
        progress.seasons[String(ext)] = [...seasonsStored];
        saveProgress(progress);
      }

      doneSet.add(ext);
      progress.done = [...doneSet];
      delete progress.seasons[String(ext)];
      saveProgress(progress);
      playersTouched++;
      if (playersTouched % 10 === 0) {
        console.log(
          `  enriched ${playersTouched} players · ${seasonRows} season rows · ${requestsMade} API calls`,
        );
      }
      } catch (err) {
        // One bad player must never kill a multi-hour run: QuotaStop still
        // ends it cleanly; anything else is logged and skipped — NOT marked
        // done, so a re-run retries once the underlying bug is fixed.
        if (err instanceof QuotaStop) throw err;
        failedRefs.push(ext);
        console.warn(`  ! player ${ext} failed — skipped: ${(err as Error).message.split("\n")[0]}`);
      }
    }
  } catch (err) {
    if (err instanceof QuotaStop) {
      stopped = true;
      console.warn(`\n⏸  Stopped: ${err.message}`);
      console.warn("   Progress saved — re-run to resume.");
    } else {
      throw err;
    }
  }

  const endStatus = await apiStatus(apiKey);
  const usedEnd = endStatus?.requests?.current ?? null;
  const remaining = limitDay != null && usedEnd != null ? limitDay - usedEnd : null;

  console.log("\n==== RUN SUMMARY ====");
  console.log(`players enriched this run : ${playersTouched}`);
  console.log(`season stat rows written  : ${seasonRows}`);
  console.log(`static profiles updated   : ${staticUpdates}`);
  console.log(`API calls this run        : ${requestsMade}`);
  console.log(`players failed (skipped)  : ${failedRefs.length}${failedRefs.length ? ` — refs: ${failedRefs.join(", ")}` : ""}`);
  console.log(`daily quota               : ${usedEnd ?? "?"}/${limitDay ?? "?"} used → ${remaining ?? "?"} remaining`);
  console.log(`players fully done (total): ${doneSet.size}`);
  console.log(
    stopped
      ? "⏸  Stopped at the daily limit — re-run to resume."
      : DRY_RUN
        ? "DRY RUN — no database writes were performed."
        : "✅ All enrichable players processed.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
