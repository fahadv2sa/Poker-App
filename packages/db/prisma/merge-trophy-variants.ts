import "dotenv/config";

import { prisma } from "../src/client";

/**
 * CURATED trophy-identity merges (zero-error fix, 2026-07-06): the source
 * data records the SAME real trophy under variant identity strings, splitting
 * its winners — asking with one identity wrongly answered NO for winners
 * recorded under the other. Each entry below merges a VARIANT row into its
 * CANONICAL row (the identity with more winner rows): the variant becomes
 * inactive (not pickable) and points at the canonical via merged_into_id; the
 * resolver folds every variant identity into the ask as engine altKeys.
 *
 * Verified against player_title_totals winner counts before curation:
 *   FIFA World Cup 72 ← World Cup 19 …but Arabic media = كأس العالم either
 *   way; UEFA Conference League 98 ← UEFA Europa Conference League 1; MLS
 *   (USA) 21 ← MLS (United-States) 7; Presidents Cup UAE 7 ← 4; FNL
 *   Czech-Republic ← Czechia; EC Qualification ← UEFA European Championship
 *   Qualifiers. Idempotent; extend this list as new splits are discovered.
 */
const MERGES: ReadonlyArray<{
  canonical: { compName: string; country: string };
  variants: { compName: string; country: string }[];
}> = [
  {
    canonical: { compName: "FIFA World Cup", country: "World" },
    variants: [{ compName: "World Cup", country: "World" }],
  },
  {
    canonical: { compName: "UEFA Conference League", country: "Europe" },
    variants: [{ compName: "UEFA Europa Conference League", country: "Europe" }],
  },
  {
    canonical: { compName: "MLS", country: "USA" },
    variants: [{ compName: "MLS", country: "United-States" }],
  },
  {
    canonical: { compName: "Presidents Cup", country: "United Arab Emirates" },
    variants: [{ compName: "Presidents Cup", country: "United-Arab-Emirates" }],
  },
  {
    canonical: { compName: "FNL", country: "Czech-Republic" },
    variants: [{ compName: "FNL", country: "Czechia" }],
  },
  {
    canonical: { compName: "EC Qualification", country: "Europe" },
    variants: [{ compName: "UEFA European Championship Qualifiers", country: "Europe" }],
  },
];

async function main(): Promise<void> {
  let merged = 0;
  for (const m of MERGES) {
    const canonical = await prisma.gpAskableTrophy.findFirst({
      where: {
        compName: { equals: m.canonical.compName, mode: "insensitive" },
        country: { equals: m.canonical.country, mode: "insensitive" },
      },
    });
    if (!canonical) {
      console.warn(`WARN canonical not found: ${m.canonical.compName} (${m.canonical.country})`);
      continue;
    }
    for (const v of m.variants) {
      const r = await prisma.gpAskableTrophy.updateMany({
        where: {
          compName: { equals: v.compName, mode: "insensitive" },
          country: { equals: v.country, mode: "insensitive" },
          id: { not: canonical.id },
        },
        data: { mergedIntoId: canonical.id, active: false },
      });
      if (r.count === 0) console.warn(`WARN variant not found: ${v.compName} (${v.country})`);
      merged += r.count;
      console.log(`merged: ${v.compName} (${v.country}) → ${canonical.compName} (${canonical.country})`);
    }
  }
  console.log(`MERGED ${merged} variant row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
