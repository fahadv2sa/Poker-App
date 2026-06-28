/**
 * Top Ten — QUESTION CATALOG BUILDER (admin-time, read-mostly tool). Standalone:
 * NEVER called at gameplay time. It reads football reference data (read-only),
 * applies the completeness gate (brief §6.1) via the pure engine, tiers difficulty
 * by Σ-fame terciles, and writes the FROZEN catalog into the `top_10` schema. It also
 * emits a reviewable artifact (docs/top-10/CATALOG.md + .json) listing every admitted
 * and rejected (type, competition, season) with its metrics.
 *
 *   pnpm db:build-top10-catalog              # build + write catalog + artifact
 *   pnpm db:build-top10-catalog --dry-run    # compute + write artifact, NO DB writes
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
import { prisma, Prisma } from "../src/index";
import {
  buildRanking,
  classifyDifficulty,
  computeThresholds,
  evaluateGate,
  type CandidateRow,
} from "@fb/top-10-engine";
import {
  TT_ACTIVE_QUESTION_TYPES,
  TT_COMPETITIONS,
  TT_GATE,
  TT_TYPE_META,
  TT_WHITELIST_LEAGUE_IDS,
  type TtQuestionType,
} from "@fb/shared";

const DRY_RUN = process.argv.includes("--dry-run");

/** The SQL value-expression each active type ranks on (SUM aggregates multi-row
 *  transfer lines per player per comp/season — 2,420 such groups exist). */
const VALUE_EXPR: Record<TtQuestionType, string> = {
  GOAL_SCORERS: "SUM(s.goals_total)",
  ASSISTS: "SUM(s.goals_assists)",
  KEY_PASSES: "SUM(s.passes_key)",
  TACKLES: "SUM(s.tackles_total)",
  ACCURATE_PASSES: "SUM(s.passes_total * s.passes_accuracy / 100.0)",
  // dormant — never built (no clean-sheets column yet). Present for completeness.
  GK_CLEAN_SHEETS: "NULL",
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
}

const leagueName = (id: number) =>
  TT_COMPETITIONS.find((c) => c.leagueId === id)?.nameAr ?? String(id);

interface Admitted {
  type: TtQuestionType;
  leagueId: number;
  season: number;
  fameSum: number;
  players: ReturnType<typeof buildRanking>;
}
interface Rejected {
  type: TtQuestionType;
  leagueId: number;
  season: number;
  reasons: string[];
  metrics: ReturnType<typeof evaluateGate>["metrics"];
}

async function aggregateType(type: TtQuestionType): Promise<AggRow[]> {
  const pos = TT_TYPE_META[type].position;
  const posFilter = pos ? Prisma.sql`AND pos.code = ${pos}::"football"."position_code"` : Prisma.empty;
  const leagueList = Prisma.join(TT_WHITELIST_LEAGUE_IDS);
  // VALUE_EXPR is a fixed internal constant (never user input) → safe to inline.
  const valueExpr = Prisma.raw(VALUE_EXPR[type]);
  return prisma.$queryRaw<AggRow[]>(Prisma.sql`
    SELECT s.league_id, s.season, s.player_id,
           ${valueExpr} AS value,
           SUM(s.games_appearances) AS apps,
           COALESCE(p.fame_score, 0) AS fame,
           p.name, p.name_ar
    FROM football.player_season_stats s
    JOIN football.players p ON p.id = s.player_id
    JOIN football.positions pos ON pos.id = p.position_id
    WHERE s.league_id IN (${leagueList}) AND s.league_id IS NOT NULL
      AND s.season BETWEEN ${TT_GATE.seasonMin} AND ${TT_GATE.seasonMax}
      ${posFilter}
    GROUP BY s.league_id, s.season, s.player_id, p.fame_score, p.name, p.name_ar
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
  console.log(`Top Ten catalog build${DRY_RUN ? " [DRY RUN — no DB writes]" : ""}`);
  const admitted: Admitted[] = [];
  const rejected: Rejected[] = [];

  for (const type of TT_ACTIVE_QUESTION_TYPES) {
    const rows = await aggregateType(type);
    // group by (league, season)
    const groups = new Map<string, AggRow[]>();
    for (const r of rows) {
      const k = `${r.league_id}:${r.season}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    let admittedForType = 0;
    for (const [k, gRows] of groups) {
      const [leagueId, season] = k.split(":").map(Number) as [number, number];
      const candidates = gRows.map(toCandidate);
      const gate = evaluateGate(candidates);
      if (!gate.admit) {
        rejected.push({ type, leagueId, season, reasons: gate.reasons, metrics: gate.metrics });
        continue;
      }
      const players = buildRanking(candidates);
      const fameSum = players.reduce((a, p) => a + p.fame, 0);
      admitted.push({ type, leagueId, season, fameSum, players });
      admittedForType++;
    }
    console.log(`  ${type}: ${admittedForType} admitted / ${groups.size} candidate (comp,season)`);
  }

  // Difficulty terciles over ALL admitted lists' Σ fame.
  const thresholds = computeThresholds(admitted.map((a) => a.fameSum));
  console.log(
    `  difficulty thresholds — HARD < ${thresholds.hardMaxSum.toFixed(1)} ≤ MEDIUM < ${thresholds.easyMinSum.toFixed(1)} ≤ EASY`,
  );

  // ---- write the reviewable artifact (always, even on --dry-run) ----
  writeArtifact(admitted, rejected, thresholds);

  if (DRY_RUN) {
    console.log("DRY RUN — artifact written, no DB changes.");
    return;
  }

  // ---- write the frozen catalog (one new generation, deactivate the previous) ----
  const builtAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.ttCatalogEntry.updateMany({ data: { active: false }, where: { active: true } });
    await tx.ttDifficultyConfig.create({
      data: {
        easyMinSum: thresholds.easyMinSum,
        hardMaxSum: thresholds.hardMaxSum,
        entriesCount: admitted.length,
        builtAt,
      },
    });
    for (const a of admitted) {
      const difficulty = classifyDifficulty(a.fameSum, thresholds);
      await tx.ttCatalogEntry.create({
        data: {
          type: a.type,
          leagueId: a.leagueId,
          competitionName: leagueName(a.leagueId),
          season: a.season,
          difficulty,
          fameSum: a.fameSum,
          active: true,
          builtAt,
          players: {
            create: a.players.map((p) => ({
              rank: p.rank,
              footballPlayerId: p.playerId,
              value: p.value,
              fameAtBuild: p.fame,
            })),
          },
        },
      });
    }
  });

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
      leagueId: a.leagueId,
      competition: leagueName(a.leagueId),
      season: a.season,
      difficulty: classifyDifficulty(a.fameSum, thresholds),
      fameSum: Number(a.fameSum.toFixed(1)),
      top: a.players.map((p) => ({ rank: p.rank, name: p.nameAr, value: p.value })),
    })),
    rejected: rejected.map((r) => ({
      type: r.type,
      leagueId: r.leagueId,
      competition: leagueName(r.leagueId),
      season: r.season,
      reasons: r.reasons,
      fillPct: Number((r.metrics.regularsFillPct * 100).toFixed(0)),
      qualifiers: r.metrics.qualifiers,
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
    `Gate: regulars-fill ≥ ${(TT_GATE.regularsFillMin * 100).toFixed(0)}% (top ${TT_GATE.regularsTopN} by apps, ≥${TT_GATE.minAppearances} apps), ≥${TT_GATE.minQualifiers} qualifiers, 10th value > 0, seasons ${TT_GATE.seasonMin}–${TT_GATE.seasonMax}.`,
  );
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
  lines.push("## Admitted (type · competition · season · difficulty · Σfame)");
  lines.push("");
  for (const a of [...admitted].sort(
    (x, y) => x.type.localeCompare(y.type) || x.leagueId - y.leagueId || x.season - y.season,
  )) {
    lines.push(
      `- ${a.type} · ${leagueName(a.leagueId)} · ${a.season} · ${classifyDifficulty(a.fameSum, thresholds)} · Σ${a.fameSum.toFixed(0)}`,
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
