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
  type CandidateRow,
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

const VALUE_EXPR: Record<string, string> = {
  GOAL_SCORERS: "SUM(s.goals_total)",
  ASSISTS: "SUM(s.goals_assists)",
  KEY_PASSES: "SUM(s.passes_key)",
  TACKLES: "SUM(s.tackles_total)",
  ACCURATE_PASSES: "SUM(s.passes_total * s.passes_accuracy / 100.0)",
};

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

function toCandidate(r: AggRow): CandidateRow {
  return {
    playerId: r.player_id,
    value: r.value == null ? null : Number(r.value),
    appearances: r.apps == null ? 0 : Number(r.apps),
    fame: Number(r.fame),
    name: r.name,
    nameAr: r.name_ar ?? r.name,
  };
}

async function main() {
  console.log("Top Ten — catalog integrity audit (read-only)\n");

  // 1) Re-derive every (type, league, season) group from current data.
  type Group = { rows: AggRow[]; meta: Map<string, ListPlayerMeta> };
  const groups = new Map<string, Group>(); // key `${type}:${league}:${season}`
  for (const type of TT_ACTIVE_QUESTION_TYPES) {
    for (const r of await aggregateType(type)) {
      const key = `${type}:${r.league_id}:${r.season}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { rows: [], meta: new Map() }));
      g.rows.push(r);
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

  let entriesWithIssues = 0;
  let totalViolations = 0;
  let driftCount = 0;
  const sample: string[] = [];

  for (const e of entries) {
    const issues: string[] = [];
    const type = e.type as TtQuestionType;
    const title = `${type} · ${e.competitionName} ${e.season} [${e.difficulty}]`;

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

    // re-derive the true list for this group from current data
    const g = groups.get(`${type}:${e.leagueId}:${e.season}`);
    let excludedTopValue: number | null = null;
    if (!g) {
      issues.push("no current data for this (type, competition, season) — cannot re-derive");
    } else {
      const { list: trueList, excludedTopValue: ev } = buildAnswerList(g.rows.map(toCandidate));
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
