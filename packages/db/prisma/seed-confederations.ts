/**
 * Curated country → football CONFEDERATION seed (Guess the Player continent
 * question — «هل هو من قارة …؟»).
 *
 * Membership by RULE, not geography (owner ruling 2026-07-07): the reference
 * is CURRENT confederation membership — Russia/Türkiye → UEFA, Australia →
 * AFC (since 2006), Kazakhstan → UEFA. Non-FIFA confederation members that
 * appear as nationalities in the data are mapped to their confederation
 * (Réunion → CAF; Guadeloupe/Martinique/French Guiana → CONCACAF).
 *
 * Keys are the LITERAL nationality strings from football.nationalities —
 * near-duplicates (Türkiye/Turkey, Czechia/Czech Republic, Cape Verde/Cape
 * Verde Islands) are each seeded so no literal ever misses.
 *
 * ZERO-ERROR rule: the engine answers UNKNOWN for any nationality missing
 * here — this script therefore AUDITS coverage after seeding and fails loudly
 * when any player nationality is unmapped (curation TODO surfaced, never a
 * silent wrong answer).
 *
 * Idempotent: upserts every row; re-running applies curation corrections.
 *
 *   pnpm --filter @fb/db seed:confederations
 */
import "dotenv/config";
import { prisma } from "../src/client";

const CONFEDERATIONS: Record<string, string[]> = {
  UEFA: [
    "Albania", "Armenia", "Austria", "Azerbaijan", "Belarus", "Belgium",
    "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
    "Czechia", "Denmark", "England", "Estonia", "Faroe Islands", "Finland",
    "France", "Georgia", "Germany", "Greece", "Hungary", "Iceland", "Israel",
    "Italy", "Kazakhstan", "Kosovo", "Latvia", "Liechtenstein", "Lithuania",
    "Luxembourg", "Malta", "Moldova", "Montenegro", "Netherlands",
    "North Macedonia", "Northern Ireland", "Norway", "Poland", "Portugal",
    "Republic of Ireland", "Romania", "Russia", "Scotland", "Serbia",
    "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Türkiye",
    "Turkey", "Ukraine", "Wales",
  ],
  CONMEBOL: [
    "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador",
    "Paraguay", "Peru", "Uruguay", "Venezuela",
  ],
  CAF: [
    "Algeria", "Angola", "Benin", "Burkina Faso", "Burundi", "Cameroon",
    "Cape Verde", "Cape Verde Islands", "Central African Republic", "Chad",
    "Comoros", "Congo", "Congo DR", "Côte d'Ivoire", "Egypt",
    "Equatorial Guinea", "Eritrea", "Gabon", "Gambia", "Ghana", "Guinea",
    "Guinea-Bissau", "Kenya", "Libya", "Madagascar", "Mali", "Mauritania",
    "Mauritius", "Morocco", "Mozambique", "Niger", "Nigeria", "Réunion",
    "Senegal", "Sierra Leone", "South Africa", "Tanzania", "Togo", "Tunisia",
    "Uganda", "Zambia", "Zimbabwe",
  ],
  CONCACAF: [
    "Bermuda", "Canada", "Costa Rica", "Cuba", "Curaçao",
    "Dominican Republic", "El Salvador", "French Guiana", "Grenada",
    "Guadeloupe", "Guatemala", "Haiti", "Honduras", "Jamaica", "Martinique",
    "Mexico", "Panama", "Puerto Rico", "St. Kitts and Nevis", "Suriname",
    "Trinidad and Tobago", "USA",
  ],
  AFC: [
    "Australia", "China PR", "Indonesia", "Iran", "Iraq", "Japan", "Jordan",
    "Korea DPR", "Korea Republic", "Laos", "Philippines", "Qatar",
    "Saudi Arabia", "Uzbekistan",
  ],
  OFC: ["New Caledonia", "New Zealand"],
};

async function main(): Promise<void> {
  let seeded = 0;
  for (const [confederation, countries] of Object.entries(CONFEDERATIONS)) {
    for (const countryName of countries) {
      await prisma.countryConfederation.upsert({
        where: { countryName },
        create: { countryName, confederation },
        update: { confederation },
      });
      seeded++;
    }
  }
  console.log(`[confederations] seeded/updated ${seeded} country rows`);

  // ── COVERAGE AUDIT (zero-error gate) ──────────────────────────────────────
  // Every nationality actually carried by a player must be mapped; anything
  // unmapped answers UNKNOWN in-game and is surfaced here as a curation TODO.
  const unmapped = await prisma.$queryRaw<Array<{ name: string; players: bigint }>>`
    SELECT n.name, count(*)::bigint AS players
    FROM football.players p
    JOIN football.nationalities n ON n.id = p.nationality_id
    LEFT JOIN football.country_confederations cc ON cc.country_name = n.name
    WHERE cc.country_name IS NULL
    GROUP BY n.name
    ORDER BY players DESC`;
  if (unmapped.length > 0) {
    console.error(`[confederations] UNMAPPED player nationalities (${unmapped.length}) — these answer UNKNOWN:`);
    for (const row of unmapped) console.error(`  - ${row.name} (${row.players} players)`);
    process.exitCode = 1;
  } else {
    console.log("[confederations] audit CLEAN — every player nationality is mapped");
  }

  // Informational: seeded names not (currently) present as nationalities.
  const orphans = await prisma.$queryRaw<Array<{ country_name: string }>>`
    SELECT cc.country_name
    FROM football.country_confederations cc
    LEFT JOIN football.nationalities n ON n.name = cc.country_name
    WHERE n.id IS NULL
    ORDER BY cc.country_name`;
  if (orphans.length > 0) {
    console.log(`[confederations] note: ${orphans.length} seeded name(s) have no nationality row (harmless):`);
    for (const row of orphans) console.log(`  - ${row.country_name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
