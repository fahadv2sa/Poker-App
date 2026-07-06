import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gpTrophyLeagueIds, loadGpFactPack } from "../src/gp-facts";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

/**
 * Exports REAL FactPacks as committed JSON fixtures for the engine's golden
 * tests — deterministic, DB-free test input frozen from the live local data.
 * Regenerate (and re-review the golden assertions) after any football-data
 * reimport: pnpm --filter @fb/db gp:export-fixtures
 *
 * The chosen players cover the risk surface:
 *  - Mohamed Salah  — EASY tier, rich career, UCL winner (trophy+club attribution)
 *  - Yaya Touré     — the NT alias regression (Ivory Coast vs Côte d'Ivoire)
 *  - one HARD-tier player and one trophy-less player (auto-picked, stable order)
 */
const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../guess-player-engine/tests/fixtures",
);

const NAMED = ["Mohamed Salah", "Yaya Touré"];

async function idByExactName(name: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM football.players WHERE name = ${name} ORDER BY created_at LIMIT 1
  `);
  if (!rows[0]) throw new Error(`fixture player not found: ${name}`);
  return rows[0].id;
}

/** Stable auto-picks: lowest player_number-ish order by id for reproducibility. */
async function autoPicks(): Promise<{ label: string; id: string }[]> {
  const hard = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT p.id, p.name FROM football.players p
    JOIN football.player_score s ON s.player_id = p.id
    WHERE floor(s.score) BETWEEN 35 AND 49 ORDER BY p.name LIMIT 1
  `);
  const troplesss = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT p.id, p.name FROM football.players p
    JOIN football.player_score s ON s.player_id = p.id
    WHERE floor(s.score) >= 50
      AND NOT EXISTS (SELECT 1 FROM football.player_trophies t
                      WHERE t.player_id = p.id AND t.place = 'Winner')
    ORDER BY p.name LIMIT 1
  `);
  const picks: { label: string; id: string }[] = [];
  if (hard[0]) picks.push({ label: `hard-tier (${hard[0].name})`, id: hard[0].id });
  if (troplesss[0]) picks.push({ label: `trophy-less (${troplesss[0].name})`, id: troplesss[0].id });
  return picks;
}

async function labels(): Promise<Record<string, unknown>> {
  const clubNames = [
    "Liverpool",
    "Chelsea",
    "Real Madrid",
    "Barcelona",
    "Manchester City",
    "AS Roma",
  ];
  const clubs: Record<string, string> = {};
  for (const n of clubNames) {
    const r = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM football.clubs WHERE kind = 'CLUB' AND lower(name) = lower(${n}) LIMIT 1
    `);
    if (r[0]) clubs[n] = r[0].id;
  }
  return {
    clubsByName: clubs,
    competitionsByName: { "Premier League": 39, "La Liga": 140, "UEFA Champions League": 2 },
    // Keys are trophy_dim identities (UCL's trophy country is "Europe").
    trophyLeagueIds: {
      "UEFA Champions League||Europe": await gpTrophyLeagueIds("UEFA Champions League", "Europe"),
      "Premier League||England": await gpTrophyLeagueIds("Premier League", "England"),
    },
  };
}

function slug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main(): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const targets = [
    ...(await Promise.all(NAMED.map(async (n) => ({ label: n, id: await idByExactName(n) })))),
    ...(await autoPicks()),
  ];
  const shared = await labels();
  writeFileSync(join(FIXTURE_DIR, "_labels.json"), JSON.stringify(shared, null, 2));
  for (const t of targets) {
    const pack = await loadGpFactPack(t.id);
    const file = join(FIXTURE_DIR, `${slug(pack.name)}.json`);
    writeFileSync(file, JSON.stringify(pack, null, 2));
    console.log(`[fixtures] ${t.label} → ${file}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
