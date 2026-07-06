/**
 * Arabic-names audit — the owner's review sheet (gate 3 input) + anomaly
 * checks. Read-only. Prints coverage, the full top-N-by-usage review list
 * (English → Arabic, status), and FAILS on anomalies: non-Arabic-script
 * names, or two DIFFERENT clubs sharing one identical Arabic name (which
 * could make a searcher pick the wrong entity — a zero-error concern).
 *
 *   pnpm --filter @fb/db audit:arabic-names             # top 150 review rows
 *   pnpm --filter @fb/db audit:arabic-names --top=400
 */
import "dotenv/config";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

const TOP = Number(process.argv.find((a) => a.startsWith("--top="))?.slice(6) ?? 150);
let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (!ok) failures++;
};
const info = (name: string, detail: string) => console.log(`INFO  ${name} — ${detail}`);

const arabicOnlyish = (s: string) => /[؀-ۿ]/.test(s) && !/[A-Za-z]{3,}/.test(s);

async function main(): Promise<void> {
  // coverage
  const [clubTotal, clubNamed, clubLive, natNamed, compNamed, compLive, trNamed, trLive] =
    await Promise.all([
      prisma.club.count({ where: { kind: "CLUB" } }),
      prisma.club.count({ where: { kind: "CLUB", nameAr: { not: null } } }),
      prisma.club.count({ where: { kind: "CLUB", nameArVerified: true } }),
      prisma.nationality.count({ where: { nameArVerified: true } }),
      prisma.competitionNameAr.count(),
      prisma.competitionNameAr.count({ where: { verified: true } }),
      prisma.gpAskableTrophy.count({ where: { nameAr: { not: null } } }),
      prisma.gpAskableTrophy.count({ where: { nameArVerified: true } }),
    ]);
  console.log(`COVERAGE`);
  console.log(`  nationalities : ${natNamed}/145 live`);
  console.log(`  clubs         : ${clubNamed}/${clubTotal} named, ${clubLive} live (verified)`);
  console.log(`  competitions  : ${compNamed} named, ${compLive} live`);
  console.log(`  trophies      : ${trNamed}/628 named, ${trLive} live`);

  // anomaly: non-Arabic content in a candidate/live name
  const badClubs = (
    await prisma.club.findMany({
      where: { kind: "CLUB", nameAr: { not: null } },
      select: { name: true, nameAr: true },
    })
  ).filter((c) => !arabicOnlyish(c.nameAr!));
  check(
    "club Arabic names are Arabic-script",
    badClubs.length === 0,
    badClubs.length ? badClubs.slice(0, 8).map((c) => `${c.name}⇐${c.nameAr}`).join(", ") : "clean",
  );

  // anomaly: two different clubs sharing one Arabic name (search collision)
  const dupes = await prisma.$queryRaw<{ name_ar: string; names: string }[]>(Prisma.sql`
    SELECT name_ar, string_agg(name, ' | ') AS names
    FROM football.clubs
    WHERE kind = 'CLUB' AND name_ar IS NOT NULL
    GROUP BY name_ar HAVING count(*) > 1
  `);
  check(
    "no two clubs share one Arabic name",
    dupes.length === 0,
    dupes.length ? dupes.slice(0, 10).map((d) => `"${d.name_ar}": ${d.names}`).join(" ;; ") : "clean",
  );

  // anomaly: Arabic-name collisions among competitions / whitelist trophies
  // (the picker shows the English sub, but identical Arabic labels are still
  // a wrong-pick risk — resolve like club collisions).
  const compDupes = await prisma.$queryRaw<{ name_ar: string; n: number }[]>(Prisma.sql`
    SELECT name_ar, count(*)::int AS n FROM football.competition_names_ar
    GROUP BY name_ar HAVING count(*) > 1
  `);
  check(
    "no two competitions share one Arabic name",
    compDupes.length === 0,
    compDupes.length ? compDupes.slice(0, 8).map((d) => `"${d.name_ar}"×${d.n}`).join(", ") : "clean",
  );
  // ACTIVE rows only — merged variants (same real trophy, inactive) keep
  // their Arabic legitimately and are never pickable.
  const trophyDupes = await prisma.$queryRaw<{ name_ar: string; names: string }[]>(Prisma.sql`
    SELECT name_ar, string_agg(comp_name || ' (' || country || ')', ' | ') AS names
    FROM guess_player.gp_askable_trophies
    WHERE name_ar IS NOT NULL AND active = true
    GROUP BY name_ar HAVING count(*) > 1
  `);
  check(
    "no two whitelist trophies share one Arabic name",
    trophyDupes.length === 0,
    trophyDupes.length
      ? trophyDupes.slice(0, 8).map((d) => `"${d.name_ar}": ${d.names}`).join(" ;; ")
      : "clean",
  );

  // identity-alias state (trophy merges + competition alias table)
  const [trophyMerges, compAliases] = await Promise.all([
    prisma.gpAskableTrophy.count({ where: { mergedIntoId: { not: null } } }),
    prisma.competitionAlias.count(),
  ]);
  info("identity aliases", `trophy variants merged=${trophyMerges}, competition aliases=${compAliases}`);

  // the review sheet: top clubs by usage with their Arabic + status
  console.log(`\nREVIEW SHEET — top ${TOP} clubs by usage (EN → AR [live|pending|—])`);
  const sheet = await prisma.$queryRaw<{ name: string; name_ar: string | null; v: boolean; n: number }[]>(Prisma.sql`
    SELECT c.name, c.name_ar, c.name_ar_verified AS v,
           (SELECT count(*) FROM football.player_team_seasons ts WHERE lower(ts.team_name)=lower(c.name))::int AS n
    FROM football.clubs c
    WHERE c.kind = 'CLUB'
    ORDER BY n DESC
    LIMIT ${TOP}
  `);
  for (const r of sheet) {
    const status = r.v ? "live" : r.name_ar ? "pending" : "—";
    console.log(`  ${String(r.n).padStart(5)}  ${r.name}  →  ${r.name_ar ?? "(english fallback)"}  [${status}]`);
  }

  console.log(failures === 0 ? "\nAUDIT CLEAN" : `\nAUDIT FAILED — ${failures} check(s)`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
