/**
 * Top Ten — QUESTION CATALOG BUILDER (admin-time, read-mostly tool). Standalone:
 * NEVER called at gameplay time. It reads football reference data (read-only),
 * applies the completeness gate (brief §6.1) via the pure engine, tiers difficulty
 * by Σ-fame terciles, and writes the FROZEN catalog into the `top_10` schema. It also
 * emits a reviewable artifact (docs/top-10/CATALOG.md + .json) listing every admitted
 * and rejected (type, scope, season window) with its metrics.
 *
 *   pnpm db:build-top10-catalog              # build + write catalog + artifact
 *   pnpm db:build-top10-catalog --dry-run    # compute + write artifact, NO DB writes
 *
 * VARIETY model (three dimensions; the metric+position THEME is fixed per type):
 *   • competition — each of the 9 competitions, AND the Top-5 leagues combined (TOP5);
 *   • club        — one of the 9 allowed clubs (TT_CLUBS), within its league / the UCL /
 *                   all its competitions; or no club filter;
 *   • time        — single season, or a 2-/3-season cumulative range.
 * Each (type × competition × club × window) combination ships ONLY if it forms a true,
 * complete, tie-safe, findable Top-10 with an honest title — otherwise it is rejected.
 *
 * Idempotent generations: each run inserts a new generation (built_at) and flips the
 * previous entries to active=false in one transaction, so the runtime always reads a
 * single consistent active catalog. The football data is only READ; nothing is written
 * to football.* or any link_up.* table.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "../src/index";
import {
  buildAnswerList,
  classifyDifficulty,
  computeThresholds,
  evaluateGate,
  validateRankedList,
  DEFAULT_GATE_CONFIG,
  type ListPlayerMeta,
  type RankedPlayer,
} from "@fb/top-10-engine";
import {
  TT_ACTIVE_QUESTION_TYPES,
  TT_CLUBS,
  TT_COMPETITIONS,
  TT_GATE,
  TT_SINGLE_YEAR_LEAGUE_IDS,
  TT_TOP5_LABEL_AR,
  TT_TOP5_LEAGUE_IDS,
  TT_TOURNAMENT_FINALS_MAX_APPS,
  TT_TYPE_META,
  TT_UCL_LEAGUE_ID,
  TT_WHITELIST_LEAGUE_IDS,
  ttSeasonLabel,
  type TtQuestionType,
} from "@fb/shared";
import {
  aggregateWindow,
  isClubScope,
  isFindable,
  isSeasonDataComplete,
  scopeSubset,
  valueSanityViolations,
  VALUE_EXPR,
  WINDOW_SIZES,
  TT_CLUB_MIN_QUALIFIERS,
  type SearchPlayer,
  type SeasonRow,
  type TtScopeKind,
} from "./top10-guards";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * COMPETITION EXPANSION (zero-error safe). The original catalog generated only from the
 * 9 whitelisted leagues (TT_COMPETITIONS). We additionally admit the major cups — the big-5
 * domestic cups and the two UEFA club knockouts — because they are contested by the SAME
 * famous players our database fully covers, so their per-season top-10s are roster-complete
 * (the completeness gate's field-fill is trustworthy only where the roster is complete).
 * Obscure/lower leagues are intentionally NOT enabled: our fame-curated DB may miss their
 * players, and field-fill cannot detect an ABSENT top scorer — that would risk a wrong list.
 * These cups are cross-calendar (Aug–May), so they are NOT single-year tournaments.
 */
const EXTRA_COMPETITIONS: ReadonlyArray<{ leagueId: number; nameAr: string }> = [
  { leagueId: 3, nameAr: "الدوري الأوروبي" }, // UEFA Europa League
  { leagueId: 848, nameAr: "دوري المؤتمر الأوروبي" }, // UEFA Europa Conference League
  { leagueId: 143, nameAr: "كأس ملك إسبانيا" }, // Copa del Rey
  { leagueId: 45, nameAr: "كأس الاتحاد الإنجليزي" }, // FA Cup
  { leagueId: 48, nameAr: "كأس الرابطة الإنجليزية" }, // League/EFL Cup
  { leagueId: 137, nameAr: "كأس إيطاليا" }, // Coppa Italia
  { leagueId: 81, nameAr: "كأس ألمانيا" }, // DFB Pokal
  { leagueId: 66, nameAr: "كأس فرنسا" }, // Coupe de France
  { leagueId: 65, nameAr: "كأس الرابطة الفرنسية" }, // Coupe de la Ligue
];
const EXTRA_NAME = new Map(EXTRA_COMPETITIONS.map((c) => [c.leagueId, c.nameAr]));
/** Every competition the builder generates non-club COMP questions from = whitelist + cups. */
const ELIGIBLE_LEAGUE_IDS: readonly number[] = [
  ...TT_WHITELIST_LEAGUE_IDS,
  ...EXTRA_COMPETITIONS.map((c) => c.leagueId),
];

/** Contestant-facing season label (league-aware two-year span / single-year
 *  tournament). Single source of truth in @fb/shared so the artifact matches what
 *  the game-server renders at runtime. */
const seasonLabel = (season: number, seasonEnd: number, leagueId: number) =>
  ttSeasonLabel(season, seasonEnd, leagueId);

/** Every ACTIVE player, mirroring the search index, so findability is checked against
 *  the exact same data the runtime search ranks over. */
async function loadSearchIndex(): Promise<SearchPlayer[]> {
  const rows = await prisma.player.findMany({
    where: { active: true },
    select: { id: true, name: true, nameAr: true, fameScore: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, nameAr: r.nameAr, fame: r.fameScore ?? 0, active: true }));
}

interface AggRow {
  league_id: number;
  season: number;
  player_id: string;
  team_id: number | null;
  value: number | null;
  apps: number | null;
  fame: number;
  name: string;
  name_ar: string | null;
  active: boolean;
}

const leagueName = (id: number) =>
  TT_COMPETITIONS.find((c) => c.leagueId === id)?.nameAr ?? EXTRA_NAME.get(id) ?? String(id);

/** A scope = the "where/who" of a question: which leagues + (optional) which club.
 *  `completeSeason` tells whether a single season's DATA is complete for this scope
 *  (built from per-league completeness), so a window only spans complete seasons. */
interface Scope {
  kind: TtScopeKind;
  /** Stored on the entry (COMP/CLUB_*: a league id; TOP5: 0). */
  storedLeagueId: number;
  clubKey: string | null;
  clubTeamId: number | null;
  /** The leagues this scope's rows are drawn from. */
  leagueIds: Set<number>;
  /** Honest Arabic scope phrase shown in the title (e.g. "برشلونة في الدوري الإسباني"). */
  label: string;
  completeSeason: (season: number) => boolean;
}

interface Admitted {
  type: TtQuestionType;
  scope: TtScopeKind;
  leagueId: number;
  clubKey: string | null;
  competitionName: string;
  season: number; // window start
  seasonEnd: number; // window end (== season for a single season)
  fameSum: number;
  players: RankedPlayer[];
  /** Retained so the pre-write assertion can RE-validate the exact shipped list. */
  excludedTopValue: number | null;
  meta: Map<string, ListPlayerMeta>;
}
interface Rejected {
  type: TtQuestionType;
  scope: TtScopeKind;
  leagueId: number;
  competitionName: string;
  season: number;
  seasonEnd: number;
  reasons: string[];
  metrics: ReturnType<typeof evaluateGate>["metrics"];
}

async function aggregateType(type: TtQuestionType): Promise<AggRow[]> {
  const pos = TT_TYPE_META[type].position;
  const posFilter = pos ? Prisma.sql`AND pos.code = ${pos}::"football"."position_code"` : Prisma.empty;
  const leagueList = Prisma.join(ELIGIBLE_LEAGUE_IDS);
  // VALUE_EXPR is a fixed internal constant (never user input) → safe to inline.
  const valueExpr = Prisma.raw(VALUE_EXPR[type]);
  // Per (league, season, player, TEAM): team granularity lets a club-scoped question
  // filter to one club; non-club scopes simply sum across a player's teams in a window.
  // Difficulty tiering reads the NEW composite score (football.player_score.score),
  // not the retired legacy fame_score. Every question's Σ score drives its EASY/MEDIUM/HARD.
  return prisma.$queryRaw<AggRow[]>(Prisma.sql`
    SELECT s.league_id, s.season, s.player_id, s.team_id,
           ${valueExpr} AS value,
           SUM(s.games_appearances) AS apps,
           COALESCE(psc.score, 0) AS fame,
           p.name, p.name_ar, p.active
    FROM football.player_season_stats s
    JOIN football.players p ON p.id = s.player_id
    JOIN football.positions pos ON pos.id = p.position_id
    LEFT JOIN football.player_score psc ON psc.player_id = p.id
    WHERE s.league_id IN (${leagueList}) AND s.league_id IS NOT NULL
      AND s.season BETWEEN ${TT_GATE.seasonMin} AND ${TT_GATE.seasonMax}
      ${posFilter}
    GROUP BY s.league_id, s.season, s.player_id, s.team_id, psc.score, p.name, p.name_ar, p.active
  `);
}

/** All scopes generated for a type, given which leagues actually have data + a per-league
 *  per-season completeness oracle. Non-club: each competition + Top-5. Club: each of the
 *  9 clubs within its league, the UCL, and all its competitions. */
function buildScopes(
  leaguesWithData: ReadonlySet<number>,
  leagueComplete: (leagueId: number, season: number) => boolean,
): Scope[] {
  const scopes: Scope[] = [];

  // competition — each eligible league (whitelist + major cups) present in the data
  for (const lg of ELIGIBLE_LEAGUE_IDS) {
    if (!leaguesWithData.has(lg)) continue;
    scopes.push({
      kind: "COMP",
      storedLeagueId: lg,
      clubKey: null,
      clubTeamId: null,
      leagueIds: new Set([lg]),
      label: leagueName(lg),
      completeSeason: (s) => leagueComplete(lg, s),
    });
  }

  // competition — Top-5 leagues combined (complete only if ALL five are complete)
  if (TT_TOP5_LEAGUE_IDS.some((l) => leaguesWithData.has(l))) {
    scopes.push({
      kind: "TOP5",
      storedLeagueId: 0,
      clubKey: null,
      clubTeamId: null,
      leagueIds: new Set(TT_TOP5_LEAGUE_IDS),
      label: TT_TOP5_LABEL_AR,
      completeSeason: (s) => TT_TOP5_LEAGUE_IDS.every((l) => leagueComplete(l, s)),
    });
  }

  // club — within its league / the Champions League / all its competitions
  for (const club of TT_CLUBS) {
    scopes.push({
      kind: "CLUB_LEAGUE",
      storedLeagueId: club.leagueId,
      clubKey: club.key,
      clubTeamId: club.teamId,
      leagueIds: new Set([club.leagueId]),
      label: `${club.nameAr} في ${leagueName(club.leagueId)}`,
      completeSeason: (s) => leagueComplete(club.leagueId, s),
    });
    scopes.push({
      kind: "CLUB_UCL",
      storedLeagueId: TT_UCL_LEAGUE_ID,
      clubKey: club.key,
      clubTeamId: club.teamId,
      leagueIds: new Set([TT_UCL_LEAGUE_ID]),
      label: `${club.nameAr} في ${leagueName(TT_UCL_LEAGUE_ID)}`,
      completeSeason: (s) => leagueComplete(TT_UCL_LEAGUE_ID, s),
    });
    scopes.push({
      kind: "CLUB_ALL",
      storedLeagueId: club.leagueId,
      clubKey: club.key,
      clubTeamId: club.teamId,
      leagueIds: new Set([club.leagueId, TT_UCL_LEAGUE_ID]),
      label: `${club.nameAr} في كل البطولات`,
      completeSeason: (s) => leagueComplete(club.leagueId, s) && leagueComplete(TT_UCL_LEAGUE_ID, s),
    });
  }

  return scopes;
}

async function main() {
  console.log(`Top Ten catalog build${DRY_RUN ? " [DRY RUN — no DB writes]" : ""}`);
  const admitted: Admitted[] = [];
  const rejected: Rejected[] = [];
  const searchIndex = await loadSearchIndex(); // for the findability guard
  // A player's findability is constant per build → memoize (windows reuse players).
  const findCache = new Map<string, boolean>();
  const findable = (id: string, nameAr: string | null): boolean => {
    let c = findCache.get(id);
    if (c === undefined) findCache.set(id, (c = isFindable(searchIndex, { id, nameAr })));
    return c;
  };

  // GUARD — national-team tournaments (WC/Euro/Copa) sometimes bundle QUALIFYING into a
  // season's stat lines, making the "finals" answer list qualifying-based (e.g. Euro 2020
  // → 13 appearances, a GK with 42 saves). A finals run is ≤ TT_TOURNAMENT_FINALS_MAX_APPS
  // matches, so any such season with more is contaminated and must never be admitted. Keyed
  // off the FULL data (all players/positions), so the verdict is type-independent.
  const contaminatedTournamentSeasons = new Set<string>();
  {
    const rows = await prisma.$queryRaw<Array<{ league_id: number; season: number; max_app: number | null }>>(Prisma.sql`
      SELECT league_id, season, MAX(games_appearances) AS max_app
      FROM football.player_season_stats
      WHERE league_id IN (${Prisma.join([...TT_SINGLE_YEAR_LEAGUE_IDS])})
      GROUP BY league_id, season`);
    for (const r of rows) {
      if ((r.max_app ?? 0) > TT_TOURNAMENT_FINALS_MAX_APPS) contaminatedTournamentSeasons.add(`${r.league_id}:${r.season}`);
    }
    if (contaminatedTournamentSeasons.size > 0) {
      console.log(`  guard — excluding qualifier-bundled tournament seasons (maxApps > ${TT_TOURNAMENT_FINALS_MAX_APPS}): ${[...contaminatedTournamentSeasons].sort().join(", ")}`);
    }
  }
  const isContaminated = (leagueId: number, season: number) => contaminatedTournamentSeasons.has(`${leagueId}:${season}`);

  for (const type of TT_ACTIVE_QUESTION_TYPES) {
    const rows = await aggregateType(type);
    const metaById = new Map<string, ListPlayerMeta>();
    const allRows: SeasonRow[] = [];
    const byLeague = new Map<number, SeasonRow[]>();
    for (const r of rows) {
      metaById.set(r.player_id, { active: r.active, nameAr: r.name_ar });
      const sr: SeasonRow = {
        leagueId: r.league_id,
        season: r.season,
        playerId: r.player_id,
        teamId: r.team_id ?? 0,
        value: r.value == null ? null : Number(r.value),
        apps: r.apps == null ? 0 : Number(r.apps),
        fame: Number(r.fame),
        name: r.name,
        nameAr: r.name_ar,
      };
      allRows.push(sr);
      (byLeague.get(r.league_id) ?? byLeague.set(r.league_id, []).get(r.league_id)!).push(sr);
    }

    // per-league per-season DATA completeness (the building block for every scope's
    // completeness) — a season is complete for a competition when its regulars are
    // (almost) fully populated, regardless of qualifier count.
    const leagueComplete = new Map<number, Set<number>>();
    for (const [lg, lgRows] of byLeague) {
      const set = new Set<number>();
      for (let s = TT_GATE.seasonMin; s <= TT_GATE.seasonMax; s++) {
        const cands = aggregateWindow(lgRows, s, s);
        if (cands.length > 0 && isSeasonDataComplete(cands)) set.add(s);
      }
      leagueComplete.set(lg, set);
    }
    // A season is usable for a scope only if its data is complete AND (for tournaments)
    // it isn't qualifier-contaminated — so no window can ever include a bundled season.
    const lc = (lg: number, s: number) => (leagueComplete.get(lg)?.has(s) ?? false) && !isContaminated(lg, s);

    const scopes = buildScopes(new Set(byLeague.keys()), lc);

    let admittedForType = 0;
    for (const scope of scopes) {
      const subset = scopeSubset(allRows, scope.leagueIds, scope.clubTeamId);
      if (subset.length === 0) continue;
      // A club squad is small → relax the qualifier floor (completeness still enforced by
      // regulars-fill + the ≥10-distinct list validator); competition scopes keep ≥20.
      const cfg = {
        ...DEFAULT_GATE_CONFIG,
        minQualifiers: isClubScope(scope.kind) ? TT_CLUB_MIN_QUALIFIERS : TT_GATE.minQualifiers,
      };

      // windows of size 1/2/3 — only over a run of CONSECUTIVE complete seasons, so a
      // cumulative range is guaranteed complete in EVERY one of its seasons (no partial
      // cumulative totals → 0%-safe). Variety emerges naturally: competition × club ×
      // window size × time period, wherever the data supports a true, complete Top-10.
      for (const k of WINDOW_SIZES) {
        for (let s = TT_GATE.seasonMin; s + k - 1 <= TT_GATE.seasonMax; s++) {
          const end = s + k - 1;
          let allComplete = true;
          for (let y = s; y <= end; y++) if (!scope.completeSeason(y)) { allComplete = false; break; }
          if (!allComplete) continue;

          const candidates = aggregateWindow(subset, s, end);
          const gate = evaluateGate(candidates, cfg);
          if (!gate.admit) {
            rejected.push({ type, scope: scope.kind, leagueId: scope.storedLeagueId, competitionName: scope.label, season: s, seasonEnd: end, reasons: gate.reasons, metrics: gate.metrics });
            continue;
          }
          const { list: players, excludedTopValue } = buildAnswerList(candidates);
          const meta = new Map<string, ListPlayerMeta>(
            players.map((p) => [p.playerId, metaById.get(p.playerId) ?? { active: false, nameAr: p.nameAr }]),
          );
          const violations = [
            ...validateRankedList({ list: players, excludedTopValue, meta }),
            ...valueSanityViolations(type, players, k),
            ...players
              .filter((p) => !findable(p.playerId, p.nameAr))
              .map((p) => `rank ${p.rank}: player ${p.playerId} ("${p.nameAr}") is not findable by its Arabic name`),
          ];
          if (violations.length > 0) {
            rejected.push({ type, scope: scope.kind, leagueId: scope.storedLeagueId, competitionName: scope.label, season: s, seasonEnd: end, reasons: violations, metrics: gate.metrics });
            continue;
          }
          // Difficulty Σfame stays comparable: one representative (strongest) per rank.
          const fameByRank = new Map<number, number>();
          for (const p of players) fameByRank.set(p.rank, Math.max(fameByRank.get(p.rank) ?? 0, p.fame));
          const fameSum = [...fameByRank.values()].reduce((a, b) => a + b, 0);
          admitted.push({
            type,
            scope: scope.kind,
            leagueId: scope.storedLeagueId,
            clubKey: scope.clubKey,
            competitionName: scope.label,
            season: s,
            seasonEnd: end,
            fameSum,
            players,
            excludedTopValue,
            meta,
          });
          admittedForType++;
        }
      }
    }
    console.log(`  ${type}: ${admittedForType} admitted (competition × club × window)`);
  }

  // Rejection-reason tally (so a build clearly reports WHY lists were dropped).
  const rejTally = new Map<string, number>();
  for (const r of rejected) {
    const key = r.reasons.some((x) => x.includes("incomplete bottom rank"))
      ? "integrity: incomplete bottom tie group"
      : r.reasons.some((x) => x.includes("missing (need") || x.includes("distinct values"))
        ? "integrity: fewer than 10 distinct values"
        : r.reasons.some((x) => x.includes("not findable"))
          ? "integrity: unfindable answer player"
          : r.reasons.some((x) => x.includes("outside (0"))
            ? "integrity: value out of sane range"
            : r.reasons.some((x) => x.includes("Arabic name"))
              ? "integrity: missing Arabic name"
              : r.reasons.some((x) => x.includes("inactive"))
                ? "integrity: inactive (unsearchable) player"
                : r.reasons.some((x) => x.includes("duplicate"))
                  ? "integrity: duplicate in list"
                  : "completeness gate";
    rejTally.set(key, (rejTally.get(key) ?? 0) + 1);
  }
  if (rejTally.size > 0) {
    console.log("  rejected by reason:");
    for (const [k, c] of [...rejTally].sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${c}`);
  }

  // Difficulty terciles over ALL admitted lists' Σ fame.
  const thresholds = computeThresholds(admitted.map((a) => a.fameSum));
  console.log(
    `  difficulty thresholds — HARD < ${thresholds.hardMaxSum.toFixed(1)} ≤ MEDIUM < ${thresholds.easyMinSum.toFixed(1)} ≤ EASY`,
  );

  // ---- VARIETY summary (window sizes × competitions × clubs) -----------------
  const bySize = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  const byComp = new Map<string, number>(); // non-club competition scopes
  const byClub = new Map<string, number>(); // club scopes (all 3 modes)
  for (const a of admitted) {
    bySize[a.seasonEnd - a.season + 1] = (bySize[a.seasonEnd - a.season + 1] ?? 0) + 1;
    if (a.clubKey) byClub.set(a.clubKey, (byClub.get(a.clubKey) ?? 0) + 1);
    else byComp.set(a.scope === "TOP5" ? TT_TOP5_LABEL_AR : leagueName(a.leagueId), (byComp.get(a.scope === "TOP5" ? TT_TOP5_LABEL_AR : leagueName(a.leagueId)) ?? 0) + 1);
  }
  console.log(`  variety — window sizes: 1-season ${bySize[1]} / 2-season ${bySize[2]} / 3-season ${bySize[3]}`);
  console.log(
    "  variety — by competition (non-club): " +
      [...byComp].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(" · "),
  );
  console.log(
    "  variety — by club: " +
      [...byClub].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${TT_CLUBS.find((x) => x.key === k)?.nameAr ?? k} ${c}`).join(" · "),
  );

  // ---- FINAL SAFETY ASSERTION (no room for error) ----------------------------
  // Re-validate every admitted list right before it could be written. If anything
  // unsafe slipped through (e.g. a future code change), ABORT the whole build — a
  // broken question must never reach the catalog. This is the build-level guarantee.
  const assertionFailures: string[] = [];
  for (const a of admitted) {
    const tournamentContamination: string[] = [];
    for (let y = a.season; y <= a.seasonEnd; y++) {
      if (isContaminated(a.leagueId, y)) tournamentContamination.push(`qualifier-bundled tournament season ${y} (maxApps > ${TT_TOURNAMENT_FINALS_MAX_APPS})`);
    }
    const violations = [
      ...validateRankedList({ list: a.players, excludedTopValue: a.excludedTopValue, meta: a.meta }),
      ...valueSanityViolations(a.type, a.players, a.seasonEnd - a.season + 1),
      ...a.players
        .filter((p) => !isFindable(searchIndex, { id: p.playerId, nameAr: p.nameAr }))
        .map((p) => `unfindable: ${p.playerId} ("${p.nameAr}")`),
      ...tournamentContamination,
    ];
    if (violations.length > 0) {
      assertionFailures.push(`${a.type} · ${a.competitionName} ${seasonLabel(a.season, a.seasonEnd, a.leagueId)}: ${violations.join("; ")}`);
    }
  }
  if (assertionFailures.length > 0) {
    console.error(`\n❌ BUILD ABORTED — ${assertionFailures.length} admitted list(s) failed the final integrity assertion:`);
    for (const f of assertionFailures) console.error(`   - ${f}`);
    throw new Error("Integrity assertion failed — refusing to write an unsafe catalog.");
  }
  console.log(`  integrity: all ${admitted.length} admitted lists passed the validator ✓`);

  // ---- write the reviewable artifact (always, even on --dry-run) ----
  writeArtifact(admitted, rejected, thresholds);

  if (DRY_RUN) {
    console.log("DRY RUN — artifact written, no DB changes.");
    return;
  }

  // ---- write the frozen catalog (one new generation, deactivate the previous) ----
  // Bulk-insert via createMany in chunks (a handful of round-trips) rather than one nested
  // create per entry (~21k sequential round-trips) — the latter overruns the transaction
  // timeout over a remote/prod link. Client-side UUIDs let us batch entries + their players.
  const builtAt = new Date();
  const CHUNK = 2000;
  const entryRows = admitted.map((a) => ({
    id: randomUUID(),
    type: a.type,
    scope: a.scope,
    clubKey: a.clubKey,
    leagueId: a.leagueId,
    competitionName: a.competitionName,
    season: a.season,
    seasonEnd: a.seasonEnd,
    difficulty: classifyDifficulty(a.fameSum, thresholds),
    fameSum: a.fameSum,
    active: true,
    builtAt,
  }));
  const playerRows = admitted.flatMap((a, i) =>
    a.players.map((p) => ({
      id: randomUUID(),
      entryId: entryRows[i]!.id,
      rank: p.rank,
      footballPlayerId: p.playerId,
      value: p.value,
      fameAtBuild: p.fame,
    })),
  );
  await prisma.$transaction(
    async (tx) => {
      await tx.ttCatalogEntry.updateMany({ data: { active: false }, where: { active: true } });
      await tx.ttDifficultyConfig.create({
        data: {
          easyMinSum: thresholds.easyMinSum,
          hardMaxSum: thresholds.hardMaxSum,
          entriesCount: admitted.length,
          builtAt,
        },
      });
      for (let i = 0; i < entryRows.length; i += CHUNK) await tx.ttCatalogEntry.createMany({ data: entryRows.slice(i, i + CHUNK) });
      for (let i = 0; i < playerRows.length; i += CHUNK) await tx.ttCatalogPlayer.createMany({ data: playerRows.slice(i, i + CHUNK) });
    },
    { timeout: 120_000 },
  );

  const byTier = admitted.reduce<Record<string, number>>((acc, a) => {
    const d = classifyDifficulty(a.fameSum, thresholds);
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`✅ Wrote ${admitted.length} catalog entries (EASY ${byTier.EASY ?? 0} / MEDIUM ${byTier.MEDIUM ?? 0} / HARD ${byTier.HARD ?? 0}).`);
}

function writeArtifact(
  admitted: Admitted[],
  rejected: Rejected[],
  thresholds: { easyMinSum: number; hardMaxSum: number },
) {
  const dir = resolve(process.cwd(), "../../docs/top-10");
  mkdirSync(dir, { recursive: true });

  const json = {
    builtAt: new Date().toISOString(),
    gate: TT_GATE,
    thresholds,
    admittedCount: admitted.length,
    rejectedCount: rejected.length,
    admitted: admitted.map((a) => ({
      type: a.type,
      scope: a.scope,
      clubKey: a.clubKey,
      leagueId: a.leagueId,
      competition: a.competitionName,
      season: a.season,
      seasonEnd: a.seasonEnd,
      window: seasonLabel(a.season, a.seasonEnd, a.leagueId),
      difficulty: classifyDifficulty(a.fameSum, thresholds),
      fameSum: Number(a.fameSum.toFixed(1)),
      top: a.players.map((p) => ({ rank: p.rank, name: p.nameAr, value: p.value })),
    })),
    // Rejections can number in the thousands (every incomplete window) — keep a
    // representative sample in the artifact; the full count is `rejectedCount`.
    rejectedSample: rejected.slice(0, 200).map((r) => ({
      type: r.type,
      scope: r.scope,
      competition: r.competitionName,
      window: seasonLabel(r.season, r.seasonEnd, r.leagueId),
      reasons: r.reasons,
    })),
  };
  writeFileSync(resolve(dir, "CATALOG.json"), JSON.stringify(json, null, 2));

  // human-readable summary
  const byType = new Map<string, { admit: number; reject: number }>();
  for (const a of admitted) {
    const e = byType.get(a.type) ?? { admit: 0, reject: 0 };
    e.admit++;
    byType.set(a.type, e);
  }
  for (const r of rejected) {
    const e = byType.get(r.type) ?? { admit: 0, reject: 0 };
    e.reject++;
    byType.set(r.type, e);
  }
  const lines: string[] = [];
  lines.push("# Top Ten — Generated Question Catalog (reviewable artifact)");
  lines.push("");
  lines.push(`Built: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    `Gate: regulars-fill ≥ ${(TT_GATE.regularsFillMin * 100).toFixed(0)}% (top ${TT_GATE.regularsTopN} by apps, ≥${TT_GATE.minAppearances} apps), ≥${TT_GATE.minQualifiers} qualifiers (≥${TT_CLUB_MIN_QUALIFIERS} for club scopes), 10th value > 0, seasons ${TT_GATE.seasonMin}–${TT_GATE.seasonMax}.`,
  );
  lines.push("");
  lines.push("Variety: competition (each of 9 + Top-5 combined) × club (none, or one of 9 within league / UCL / all comps) × time (1/2/3-season windows).");
  lines.push("");
  lines.push(
    `Difficulty (Σ fame terciles, inverse): HARD < ${thresholds.hardMaxSum.toFixed(1)} ≤ MEDIUM < ${thresholds.easyMinSum.toFixed(1)} ≤ EASY.`,
  );
  lines.push("");
  lines.push(`**Admitted: ${admitted.length} · Rejected: ${rejected.length}**`);
  lines.push("");
  lines.push("| Question type | Admitted | Rejected |");
  lines.push("|---|---|---|");
  for (const [type, e] of byType) {
    lines.push(`| ${TT_TYPE_META[type as TtQuestionType].nameEn} (${type}) | ${e.admit} | ${e.reject} |`);
  }
  lines.push("");
  lines.push("## Admitted (type · scope · window · difficulty · Σfame)");
  lines.push("");
  for (const a of [...admitted].sort(
    (x, y) => x.type.localeCompare(y.type) || x.competitionName.localeCompare(y.competitionName) || x.season - y.season || x.seasonEnd - y.seasonEnd,
  )) {
    lines.push(
      `- ${a.type} · ${a.competitionName} · ${seasonLabel(a.season, a.seasonEnd, a.leagueId)} · ${classifyDifficulty(a.fameSum, thresholds)} · Σ${a.fameSum.toFixed(0)}`,
    );
  }
  writeFileSync(resolve(dir, "CATALOG.md"), lines.join("\n"));
  console.log(`  artifact → docs/top-10/CATALOG.md + CATALOG.json`);
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
