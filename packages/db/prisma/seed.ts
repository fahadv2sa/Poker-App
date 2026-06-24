// Load packages/db/.env before the Prisma client reads DATABASE_URL, so
// `pnpm db:seed` works on a fresh shell (audit #8) — not just via `prisma`.
import "dotenv/config";
import { BADGE_CATALOG, HAND_RANK_CATALOG } from "@fb/shared";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

/**
 * Seeds ONLY game rules (Section 17): the 4 Positions and the 9 HandRanks.
 * No real football player is ever inserted — that data is owner-supplied and
 * fully data-driven. Idempotent: safe to run repeatedly (upsert by unique key).
 *
 * The HandRank catalog (codes, strengths, and the Rule DSL of Section 7.4) is
 * the single source of truth in `@fb/shared` (HAND_RANK_CATALOG) — the very same
 * definitions the engine interprets at runtime. This seed only writes them to
 * the database.
 */

const positions: {
  code: "GK" | "DEF" | "MID" | "FWD";
  nameAr: string;
  nameEn: string;
}[] = [
  { code: "GK", nameAr: "حارس مرمى", nameEn: "Goalkeeper" },
  { code: "DEF", nameAr: "مدافع", nameEn: "Defender" },
  { code: "MID", nameAr: "وسط", nameEn: "Midfielder" },
  { code: "FWD", nameAr: "مهاجم", nameEn: "Forward" },
];

async function main() {
  for (const p of positions) {
    await prisma.position.upsert({
      where: { code: p.code },
      update: { nameAr: p.nameAr, nameEn: p.nameEn },
      create: p,
    });
  }
  console.log(`Seeded ${positions.length} positions.`);

  for (const r of HAND_RANK_CATALOG) {
    // The DSL objects are plain JSON; Prisma's InputJsonValue is structurally
    // compatible but nominally distinct, so cast through unknown.
    const rule = r.rule as unknown as Prisma.InputJsonValue;
    const examples = r.examples as unknown as Prisma.InputJsonValue;
    const fields = {
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      strength: r.strength,
      rule,
      descriptionAr: r.descriptionAr,
      examples,
      active: true,
    };
    await prisma.handRank.upsert({
      where: { code: r.code },
      update: fields,
      create: { code: r.code, ...fields },
    });
  }
  console.log(`Seeded ${HAND_RANK_CATALOG.length} hand ranks.`);

  // Badges (Layer 3) — data-driven, same upsert-by-code pattern as hand ranks.
  // Adding a badge later = add a row to BADGE_CATALOG and re-seed (or INSERT).
  for (const b of BADGE_CATALOG) {
    const fields = {
      nameAr: b.nameAr,
      descriptionAr: b.descriptionAr,
      icon: b.icon,
      sortOrder: b.sortOrder,
      active: true,
      rule: b.rule as unknown as Prisma.InputJsonValue,
    };
    await prisma.badge.upsert({
      where: { code: b.code },
      update: fields,
      create: { code: b.code, ...fields },
    });
  }
  console.log(`Seeded ${BADGE_CATALOG.length} badges.`);
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
