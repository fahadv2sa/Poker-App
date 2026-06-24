/**
 * Phase 2 sync: copy the 4 DISPLAY columns (fame_score, tier, is_legend,
 * legend_score) from the LOCAL DB to PROD, keyed by player id (UUIDs match —
 * prod players were imported from a local data-only dump). Display/difficulty
 * only: never touches wallet/ledger/rank engine.
 *
 *   PROD_URL="<railway-public-url>" NODE_OPTIONS=--use-system-ca \
 *     pnpm --filter @fb/db exec tsx prisma/sync-scores-to-prod.ts
 *
 * Backs up prod's current 4 columns to a timestamped JSON before writing.
 */
import { PrismaClient } from "../src/generated/client";
import { writeFileSync } from "node:fs";

const LOCAL_URL =
  "postgresql://football:football@localhost:5432/football_poker?schema=public";
const PROD_URL = process.env.PROD_URL;
if (!PROD_URL) throw new Error("PROD_URL env var is required");

const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const prod = new PrismaClient({ datasources: { db: { url: PROD_URL } } });

const COLS = {
  id: true,
  fameScore: true,
  tier: true,
  isLegend: true,
  legendScore: true,
} as const;

type Row = {
  id: string;
  fameScore: number | null;
  tier: number | null;
  isLegend: boolean;
  legendScore: number | null;
};

const num = (n: number | null) => (n === null ? "null" : Number(n));
const valuesRow = (r: Row) =>
  `('${r.id}'::uuid, ${num(r.fameScore)}::float8, ${
    r.tier === null ? "null" : parseInt(String(r.tier), 10)
  }::int, ${r.isLegend ? "true" : "false"}::bool, ${num(r.legendScore)}::float8)`;

async function main() {
  // 1. Back up prod's current 4 columns (rollback insurance).
  const before = (await prod.player.findMany({ select: COLS })) as Row[];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `prod-display-cols-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(before));
  const legendsBefore = before.filter((r) => r.legendScore !== null).length;
  console.log(
    `backup written: ${backup} (${before.length} rows, legends before: ${legendsBefore})`,
  );

  // 2. Read local (source of truth for the new scores).
  const rows = (await local.player.findMany({ select: COLS })) as Row[];
  const legendsLocal = rows.filter((r) => r.legendScore !== null).length;
  console.log(`local rows: ${rows.length} (legends: ${legendsLocal})`);

  // 3. Bulk update prod in one transaction, chunked VALUES join by id.
  const CHUNK = 500;
  let affected = 0;
  await prod.$transaction(
    async (tx) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const sql =
          `UPDATE players AS p SET ` +
          `fame_score = v.fame_score, tier = v.tier, ` +
          `is_legend = v.is_legend, legend_score = v.legend_score ` +
          `FROM (VALUES ${chunk.map(valuesRow).join(",")}) ` +
          `AS v(id, fame_score, tier, is_legend, legend_score) ` +
          `WHERE p.id = v.id`;
        affected += await tx.$executeRawUnsafe(sql);
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  console.log(`rows updated on prod: ${affected}`);

  // 4. Verify prod now matches local.
  const t = await prod.player.count();
  const leg = await prod.player.count({ where: { isLegend: true } });
  const legScore = await prod.player.count({
    where: { legendScore: { not: null } },
  });
  const tiers = await prod.player.groupBy({
    by: ["tier"],
    _count: { _all: true },
    orderBy: { tier: "asc" },
  });
  const contento = await prod.player.findUnique({
    where: { id: "00127629-3e43-4a77-a0d3-4dfda59b3da1" },
    select: { name: true, fameScore: true, tier: true },
  });
  const messi = await prod.player.findFirst({
    where: { name: "L. Messi" },
    select: { fameScore: true, legendScore: true, isLegend: true },
  });
  console.log("\n=== PROD AFTER SYNC ===");
  console.log(`players: ${t} | is_legend=true: ${leg} | legend_score!=null: ${legScore}`);
  console.log(
    `tiers: ${tiers.map((g) => `${g.tier}:${g._count._all}`).join(" / ")}`,
  );
  console.log(`D. Contento: ${JSON.stringify(contento)}`);
  console.log(`L. Messi: ${JSON.stringify(messi)}`);
}

main()
  .catch((e) => {
    console.error("SYNC FAILED:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await local.$disconnect();
    await prod.$disconnect();
  });
