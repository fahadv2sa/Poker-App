/**
 * Gate 3 of the strict Arabic-names policy: after generation AND the verifier
 * pass AND the owner's audit review, flip the surviving candidate names to
 * verified=true — the ONLY switch that makes them searchable/displayable.
 *
 *   pnpm --filter @fb/db publish:arabic-names              # DRY: counts + samples
 *   pnpm --filter @fb/db publish:arabic-names --confirm    # go live
 *
 * Safe because verify-arabic-names.ts already NULLed every rejected name; the
 * remaining (name_ar set, verified=false) set is exactly "verifier-passed,
 * awaiting owner". Run this only after the audit report looks right.
 */
import "dotenv/config";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

const CONFIRM = process.argv.includes("--confirm");

async function main(): Promise<void> {
  const [clubs, comps, trophies] = await Promise.all([
    prisma.club.count({ where: { kind: "CLUB", nameAr: { not: null }, nameArVerified: false } }),
    prisma.competitionNameAr.count({ where: { verified: false } }),
    prisma.gpAskableTrophy.count({ where: { nameAr: { not: null }, nameArVerified: false } }),
  ]);
  console.log(`Publishable (verifier-passed, unpublished): clubs=${clubs} competitions=${comps} trophies=${trophies}`);

  const sample = await prisma.club.findMany({
    where: { kind: "CLUB", nameAr: { not: null }, nameArVerified: false },
    select: { name: true, nameAr: true },
    take: 15,
  });
  for (const s of sample) console.log(`  ${s.name} → ${s.nameAr}`);

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing published. Re-run with --confirm after the audit review.");
    return;
  }

  const [c1, c2, c3] = await Promise.all([
    prisma.club.updateMany({
      where: { kind: "CLUB", nameAr: { not: null }, nameArVerified: false },
      data: { nameArVerified: true },
    }),
    prisma.$executeRaw(Prisma.sql`UPDATE football.competition_names_ar SET verified = true WHERE verified = false`),
    prisma.gpAskableTrophy.updateMany({
      where: { nameAr: { not: null }, nameArVerified: false },
      data: { nameArVerified: true },
    }),
  ]);
  console.log(`PUBLISHED — clubs=${c1.count} competitions=${c2} trophies=${c3.count} now live.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
