/**
 * Collision/mixed-script resolver for GENERATED Arabic club names — runs
 * between verify and audit. Two rules, both only ever REMOVE a candidate
 * name (English fallback), never invent one:
 *
 *  1. Mixed script: any unverified name_ar containing Latin letters → NULL.
 *  2. Collision groups (several clubs sharing one Arabic name — duplicate DB
 *     rows, reserve sides that lost their suffix, or genuinely different
 *     clubs with the same media name like الأهلي/النصر): keep the Arabic on
 *     the BEST row (curated/verified first, then highest career usage) and
 *     NULL every other UNVERIFIED row. A curated row is never touched.
 *
 * Post-launch curation can hand-disambiguate the dropped ones (e.g.
 * "ليون المكسيكي") via seed-arabic-names.ts; until then they read in English,
 * which is always correct. Idempotent.
 */
import "dotenv/config";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

async function main(): Promise<void> {
  // 1) mixed-script rejects (unverified only)
  const mixed = await prisma.$queryRaw<{ id: string; name: string; name_ar: string }[]>(Prisma.sql`
    SELECT id, name, name_ar FROM football.clubs
    WHERE kind = 'CLUB' AND name_ar IS NOT NULL AND name_ar_verified = false
      AND name_ar ~ '[A-Za-z]'
  `);
  for (const m of mixed) {
    console.log(`mixed-script → english fallback: ${m.name} ⇐ ${m.name_ar}`);
    await prisma.club.update({ where: { id: m.id }, data: { nameAr: null } });
  }

  // 2) collision groups
  const groups = await prisma.$queryRaw<
    { name_ar: string; id: string; name: string; v: boolean; usage: number }[]
  >(Prisma.sql`
    SELECT c.name_ar, c.id, c.name, c.name_ar_verified AS v,
           (SELECT count(*) FROM football.player_team_seasons ts
            WHERE lower(ts.team_name) = lower(c.name))::int AS usage
    FROM football.clubs c
    WHERE c.kind = 'CLUB' AND c.name_ar IS NOT NULL
      AND c.name_ar IN (
        SELECT name_ar FROM football.clubs
        WHERE kind = 'CLUB' AND name_ar IS NOT NULL
        GROUP BY name_ar HAVING count(*) > 1
      )
    ORDER BY c.name_ar, c.name_ar_verified DESC, usage DESC
  `);
  const byName = new Map<string, typeof groups>();
  for (const g of groups) {
    byName.set(g.name_ar, [...(byName.get(g.name_ar) ?? []), g]);
  }
  let dropped = 0;
  for (const [ar, rows] of byName) {
    // rows are ordered best-first (verified, then usage); keep rows[0].
    for (const loser of rows.slice(1)) {
      if (loser.v) {
        // Two CURATED rows colliding would be a seed bug — surface loudly.
        console.error(`CURATED collision needs a human: "${ar}" on ${rows[0]!.name} AND ${loser.name}`);
        process.exitCode = 1;
        continue;
      }
      console.log(`collision "${ar}": keep ${rows[0]!.name} (u=${rows[0]!.usage}) → english fallback: ${loser.name} (u=${loser.usage})`);
      await prisma.club.update({ where: { id: loser.id }, data: { nameAr: null } });
      dropped++;
    }
  }
  // 3) competition collisions: keep the Arabic on the most-played league_id,
  //    drop it from the rest (row deleted → English fallback; verified kept).
  const compGroups = await prisma.$queryRaw<
    { name_ar: string; league_id: number; verified: boolean; usage: number }[]
  >(Prisma.sql`
    SELECT a.name_ar, a.league_id, a.verified,
           coalesce((SELECT sum(t.matches) FROM football.player_competition_totals t
                     WHERE t.league_id = a.league_id), 0)::int AS usage
    FROM football.competition_names_ar a
    WHERE a.name_ar IN (
      SELECT name_ar FROM football.competition_names_ar GROUP BY name_ar HAVING count(*) > 1
    )
    ORDER BY a.name_ar, a.verified DESC, usage DESC
  `);
  const compByName = new Map<string, typeof compGroups>();
  for (const g of compGroups) compByName.set(g.name_ar, [...(compByName.get(g.name_ar) ?? []), g]);
  let compDropped = 0;
  for (const [ar, rows] of compByName) {
    for (const loser of rows.slice(1)) {
      if (loser.verified) {
        console.error(`CURATED comp collision needs a human: "${ar}" league_ids ${rows[0]!.league_id} AND ${loser.league_id}`);
        process.exitCode = 1;
        continue;
      }
      console.log(`comp collision "${ar}": keep league ${rows[0]!.league_id} → english fallback: league ${loser.league_id}`);
      await prisma.competitionNameAr.delete({ where: { leagueId: loser.league_id } });
      compDropped++;
    }
  }

  // 4) whitelist-trophy collisions: keep the Arabic on the most-won identity,
  //    NULL the variant rows' Arabic (identity + verification untouched).
  const trGroups = await prisma.$queryRaw<
    { name_ar: string; id: string; comp_name: string; country: string; v: boolean; usage: number }[]
  >(Prisma.sql`
    SELECT t.name_ar, t.id, t.comp_name, t.country, t.name_ar_verified AS v,
           coalesce((SELECT count(*) FROM football.player_title_totals u
                     WHERE lower(u.comp_name) = lower(t.comp_name)
                       AND lower(coalesce(u.country,'')) = lower(t.country)), 0)::int AS usage
    FROM guess_player.gp_askable_trophies t
    WHERE t.name_ar IS NOT NULL AND t.name_ar IN (
      SELECT name_ar FROM guess_player.gp_askable_trophies
      WHERE name_ar IS NOT NULL GROUP BY name_ar HAVING count(*) > 1
    )
    ORDER BY t.name_ar, t.name_ar_verified DESC, usage DESC
  `);
  const trByName = new Map<string, typeof trGroups>();
  for (const g of trGroups) trByName.set(g.name_ar, [...(trByName.get(g.name_ar) ?? []), g]);
  let trDropped = 0;
  for (const [ar, rows] of trByName) {
    for (const loser of rows.slice(1)) {
      if (loser.v) {
        console.error(`CURATED trophy collision needs a human: "${ar}" on ${rows[0]!.comp_name} AND ${loser.comp_name}`);
        process.exitCode = 1;
        continue;
      }
      console.log(`trophy collision "${ar}": keep ${rows[0]!.comp_name} (${rows[0]!.country}, wins=${rows[0]!.usage}) → english fallback: ${loser.comp_name} (${loser.country}, wins=${loser.usage})`);
      await prisma.gpAskableTrophy.update({ where: { id: loser.id }, data: { nameAr: null } });
      trDropped++;
    }
  }

  console.log(
    `RESOLVED — mixed-script=${mixed.length} club-drops=${dropped} comp-drops=${compDropped} trophy-drops=${trDropped}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
