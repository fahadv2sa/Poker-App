/**
 * Top Ten — CATALOG INTEGRITY AUDIT (read-only). Verifies that EVERY shipped
 * question is safe to put in front of a contestant: a correct answer can never be
 * marked wrong, and every revealed card shows correct, findable information. It is
 * the standing guarantee behind "0% error in the Top-10 list or the info shown".
 *
 * For each ACTIVE catalog entry it:
 *   - re-derives the true Top-10 from current football data (same aggregation as the
 *     builder) and checks the STORED list matches it exactly (ids, order, values);
 *   - runs the pure integrity validator (no boundary tie, distinct active players
 *     with Arabic names, contiguous ranks, non-increasing positive values, …).
 * It also surfaces title/translation gaps (missing competition or type label).
 *
 *   pnpm db:audit-top10        # prints a full report; exits 1 if ANY violation
 *
 * Read-only: never writes to football.* or top_10.*.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { prisma, Prisma } from "../src/index";
import {
  buildAnswerList,
  validateRankedList,
  type ListPlayerMeta,
} from "@fb/top-10-engine";
import {
  TT_ACTIVE_QUESTION_TYPES,
  TT_COMPETITIONS,
  TT_GATE,
  TT_TYPE_META,
  TT_WHITELIST_LEAGUE_IDS,
  type TtQuestionType,
} from "@fb/shared";
import { aggregateWindow, isFindable, valueSanityViolations, VALUE_EXPR, type SearchPlayer, type SeasonRow } from "./top10-guards";

interface AggRow {
  league_id: number;
  season: number;
  player_id: string;
  value: number | null;
  apps: number | null;
  fame: number;
  name: string;
  name_ar: string | null;
  active: boolean;
}

/** Mirrors build-top10-catalog.ts aggregateType, plus p.active for findability. */
async function aggregateType(type: TtQuestionType): Promise<AggRow[]> {
  const pos = TT_TYPE_META[type].position;
  const posFilter = pos ? Prisma.sql`AND pos.code = ${pos}::"football"."position_code"` : Prisma.empty;
  const leagueList = Prisma.join([...TT_WHITELIST_LEAGUE_IDS]);
  const valueExpr = Prisma.raw(VALUE_EXPR[type]!);
  return prisma.$queryRaw<AggRow[]>(Prisma.sql`
    SELECT s.league_id, s.season, s.player_id,
           ${valueExpr} AS value,
           SUM(s.games_appearances) AS apps,
           COALESCE(p.fame_score, 0) AS fame,
           p.name, p.name_ar, p.active
    FROM football.player_season_stats s
    JOIN football.players p ON p.id = s.player_id
    JOIN football.positions pos ON pos.id = p.position_id
    WHERE s.league_id IN (${leagueList}) AND s.league_id IS NOT NULL
      AND s.season BETWEEN ${TT_GATE.seasonMin} AND ${TT_GATE.seasonMax}
      ${posFilter}
    GROUP BY s.league_id, s.season, s.player_id, p.fame_score, p.name, p.name_ar, p.active
  `);
}

const toSeasonRow = (r: AggRow): SeasonRow => ({
  leagueId: r.league_id,
  season: r.season,
  playerId: r.player_id,
  value: r.value == null ? null : Number(r.value),
  apps: r.apps == null ? 0 : Number(r.apps),
  fame: Number(r.fame),
  name: r.name,
  nameAr: r.name_ar,
});

async function main() {
  console.log("Top Ten — catalog integrity audit (read-only)\n");

  // 1) Per-(type, league) season rows from current data — windows are folded in memory.
  type Group = { rows: SeasonRow[]; meta: Map<string, ListPlayerMeta> };
  const groups = new Map<string, Group>(); // key `${type}:${league}`
  for (const type of TT_ACTIVE_QUESTION_TYPES) {
    for (const r of await aggregateType(type)) {
      const key = `${type}:${r.league_id}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { rows: [], meta: new Map() }));
      g.rows.push(toSeasonRow(r));
      g.meta.set(r.player_id, { active: r.active, nameAr: r.name_ar });
    }
  }

  // 2) Load the ACTIVE stored catalog.
  const entries = await prisma.ttCatalogEntry.findMany({
    where: { active: true },
    include: { players: { orderBy: { rank: "asc" } } },
  });

  // current football meta for every stored player (catches inactive / missing /
  // no-Arabic-name even if a group re-derivation is unavailable).
  const allIds = [...new Set(entries.flatMap((e) => e.players.map((p) => p.footballPlayerId)))];
  const storedPlayers = await prisma.player.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true, nameAr: true, active: true },
  });
  const metaById = new Map<string, ListPlayerMeta & { name: string }>(
    storedPlayers.map((p) => [p.id, { active: p.active, nameAr: p.nameAr, name: p.name }]),
  );

  // search index (all active players) for the findability guard + collision report.
  const searchIndex: SearchPlayer[] = (
    await prisma.player.findMany({ where: { active: true }, select: { id: true, name: true, nameAr: true, fameScore: true } })
  ).map((p) => ({ id: p.id, name: p.name, nameAr: p.nameAr, fame: p.fameScore ?? 0, active: true }));
  const nameArCount = new Map<string, number>();
  for (const p of searchIndex) {
    const a = (p.nameAr ?? "").trim();
    if (a) nameArCount.set(a, (nameArCount.get(a) ?? 0) + 1);
  }
  let collisionPlayers = 0; // catalog answers whose name_ar is shared by another active player

  let entriesWithIssues = 0;
  let totalViolations = 0;
  let driftCount = 0;
  const sample: string[] = [];

  for (const e of entries) {
    const issues: string[] = [];
    const type = e.type as TtQuestionType;
    const win = e.seasonEnd && e.seasonEnd !== e.season ? `${e.season}–${e.seasonEnd}` : `${e.season}`;
    const title = `${type} · ${e.competitionName} ${win} [${e.difficulty}]`;

    // title / translation completeness
    if (!TT_TYPE_META[type]?.nameAr?.trim()) issues.push("missing Arabic type label");
    if (!TT_COMPETITIONS.find((c) => c.leagueId === e.leagueId)?.nameAr?.trim()) {
      issues.push(`competition ${e.leagueId} has no Arabic name`);
    }
    if (!e.competitionName?.trim()) issues.push("stored competitionName is blank");

    // stored list as RankedPlayer[]
    const storedList = e.players.map((p) => {
      const m = metaById.get(p.footballPlayerId);
      return {
        rank: p.rank,
        playerId: p.footballPlayerId,
        value: Number(p.value),
        fame: Number(p.fameAtBuild),
        name: m?.name ?? "?",
        nameAr: m?.nameAr ?? m?.name ?? "?",
      };
    });

    // re-derive the true list for this entry's WINDOW [season..seasonEnd] from current data
    const end = e.seasonEnd ?? e.season;
    const g = groups.get(`${type}:${e.leagueId}`);
    let excludedTopValue: number | null = null;
    if (!g) {
      issues.push("no current data for this (type, competition) — cannot re-derive");
    } else {
      const { list: trueList, excludedTopValue: ev } = buildAnswerList(aggregateWindow(g.rows, e.season, end));
      excludedTopValue = ev;
      // drift: stored vs current-true. Compare as SETS per rank (rank-10 tie group
      // order among equals is not significant), so a legitimate tie isn't flagged.
      const key = (p: { rank: number; playerId: string; value: number }) =>
        `${p.rank}:${p.playerId}:${Number(p.value)}`;
      const trueSet = new Set(trueList.map(key));
      const storedSet = new Set(storedList.map(key));
      const sameSeq =
        trueSet.size === storedSet.size && [...trueSet].every((k) => storedSet.has(k));
      if (!sameSeq) {
        driftCount++;
        issues.push("STORED list differs from the current true list (data drift since build)");
      }
    }

    // integrity validation of the STORED list (what actually ships)
    const meta = new Map<string, ListPlayerMeta>(
      storedList.map((p) => [p.playerId, metaById.get(p.playerId) ?? { active: false, nameAr: null }]),
    );
    issues.push(...validateRankedList({ list: storedList, excludedTopValue, meta }));

    // (8) value sanity + (11) findability — same guards the builder enforces.
    issues.push(...valueSanityViolations(type, storedList, end - e.season + 1));
    issues.push(
      ...storedList
        .filter((p) => !isFindable(searchIndex, { id: p.playerId, nameAr: p.nameAr }))
        .map((p) => `rank ${p.rank}: "${p.nameAr}" not findable by its Arabic name`),
    );

    // (8) ACCURATE_PASSES value can never exceed the player's total passes (summed
    //     over the SAME window the entry covers).
    if (type === "ACCURATE_PASSES" || type === "ACCURATE_PASSES_ALL") {
      const totals = await prisma.$queryRaw<{ pid: string; pt: number | null }[]>(Prisma.sql`
        SELECT player_id pid, SUM(passes_total) pt FROM football.player_season_stats
        WHERE league_id = ${e.leagueId} AND season BETWEEN ${e.season} AND ${end}
          AND player_id IN (${Prisma.join(storedList.map((p) => Prisma.sql`${p.playerId}::uuid`))})
        GROUP BY player_id`);
      const ptById = new Map(totals.map((t) => [t.pid, Number(t.pt ?? 0)]));
      for (const p of storedList) {
        const pt = ptById.get(p.playerId) ?? 0;
        if (p.value > pt + 0.5) issues.push(`rank ${p.rank}: accurate passes ${p.value} > total passes ${pt} (impossible)`);
      }
    }

    // (12) name collision — reported (mitigated by search disambiguation), not fatal.
    for (const p of storedList) {
      const a = (metaById.get(p.playerId)?.nameAr ?? "").trim();
      if (a && (nameArCount.get(a) ?? 0) > 1) collisionPlayers++;
    }

    if (issues.length > 0) {
      entriesWithIssues++;
      totalViolations += issues.length;
      if (sample.length < 25) sample.push(`  ✗ ${title}\n      - ${issues.join("\n      - ")}`);
    }
  }

  console.log(`Active catalog entries audited: ${entries.length}`);
  console.log(`Entries with ≥1 violation:     ${entriesWithIssues}`);
  console.log(`Total violations:              ${totalViolations}`);
  console.log(`Entries drifted from data:     ${driftCount}`);
  console.log(`Answer cards sharing a name (info; mitigated by search disambiguation): ${collisionPlayers}`);
  if (sample.length > 0) {
    console.log(`\nViolations (first ${sample.length}):`);
    console.log(sample.join("\n"));
  }

  const clean = entriesWithIssues === 0;
  console.log(`\n${clean ? "✅ PASS — 0 integrity violations across the catalog." : "❌ FAIL — catalog has integrity violations (above). Fix + rebuild before shipping."}`);
  if (!clean) process.exitCode = 1;
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
