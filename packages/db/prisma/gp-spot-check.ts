import "dotenv/config";

import {
  answerQuestion,
  type GpDifficulty,
  type GpFactPack,
  type GpQuestion,
} from "@fb/guess-player-engine";
import { gpTrophyLeagueIds, gpVsSystemPoolIds, loadGpFactPack } from "../src/gp-facts";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

/**
 * Owner-facing spot-check CLI: pick any player and see EVERY answer the
 * verification engine would give — the human review gate before the engine is
 * trusted live (zero-error rule). Read-only.
 *
 *   pnpm --filter @fb/db gp:spot-check -- "Mohamed Salah"
 *   pnpm --filter @fb/db gp:spot-check -- --random 3 --tier HARD
 */

const CONTROL_CLUBS = ["Real Madrid", "Liverpool", "Al-Hilal Saudi FC"];
const CONTROL_COMPS: [number, string][] = [
  [39, "Premier League"],
  [140, "La Liga"],
  [2, "UEFA Champions League"],
];
const CONTROL_COUNTRIES = ["Brazil", "Egypt", "France"];
// Trophy identity uses trophy_dim values — UCL's country there is "Europe".
const CONTROL_TROPHY = { compName: "UEFA Champions League", country: "Europe" };

async function clubIdByName(name: string): Promise<{ id: string; name: string } | null> {
  const rows = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT id, name FROM football.clubs WHERE kind = 'CLUB' AND lower(name) = lower(${name}) LIMIT 1
  `);
  return rows[0] ?? null;
}

async function labelsFor(f: GpFactPack): Promise<{
  clubs: Map<string, string>;
  comps: Map<number, string>;
}> {
  const clubs = new Map<string, string>();
  if (f.clubIdsEver.length > 0) {
    const rows = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
      SELECT id, name FROM football.clubs WHERE id IN (${Prisma.join(f.clubIdsEver.map((id) => Prisma.sql`${id}::uuid`))})
    `);
    for (const r of rows) clubs.set(r.id, r.name);
  }
  const comps = new Map<number, string>();
  if (f.competitionIdsEver.length > 0) {
    const rows = await prisma.$queryRaw<{ league_id: number; comp_name: string }[]>(Prisma.sql`
      SELECT league_id, comp_name FROM football.competition_dim
      WHERE league_id IN (${Prisma.join(f.competitionIdsEver)})
    `);
    for (const r of rows) comps.set(r.league_id, r.comp_name);
  }
  return { clubs, comps };
}

function ask(f: GpFactPack, q: GpQuestion, label: string): void {
  const a = answerQuestion(q, f);
  const mark = a === "YES" ? "✅ نعم" : a === "NO" ? "❌ لا" : "⚪ لا يمكن الإجابة";
  console.log(`  ${mark.padEnd(18)} ${label}`);
}

async function spotCheck(f: GpFactPack): Promise<void> {
  const { clubs, comps } = await labelsFor(f);
  console.log(`\n════ ${f.name}${f.nameAr ? ` (${f.nameAr})` : ""} — ${f.nationalityName} ════`);
  console.log(
    `facts: clubs=${f.clubIdsEver.length} clubSeasons=${f.clubSeasons.length} ` +
      `NT=[${f.nationalTeamCountries.join(", ")}] comps=${f.competitionIdsEver.length} ` +
      `trophies=${f.trophies.length} trophiesImported=${f.trophiesImported}`,
  );

  console.log("— الأندية (CLUB_EVER / CLUB_SEASON):");
  for (const clubId of f.clubIdsEver) {
    ask(f, { template: "CLUB_EVER", clubId }, `هل لعب في ${clubs.get(clubId) ?? clubId}؟`);
  }
  for (const name of CONTROL_CLUBS) {
    const club = await clubIdByName(name);
    if (club && !f.clubIdsEver.includes(club.id)) {
      ask(f, { template: "CLUB_EVER", clubId: club.id }, `هل لعب في ${club.name}؟ (control)`);
    }
  }
  const sampleSeasons = f.clubSeasons.slice(0, 3);
  for (const cs of sampleSeasons) {
    ask(
      f,
      { template: "CLUB_SEASON", clubId: cs.clubId, season: cs.season },
      `هل لعب لـ${clubs.get(cs.clubId)} موسم ${cs.season}/${cs.season + 1}؟`,
    );
  }
  const gapSeason = 1998;
  const anyClub = f.clubIdsEver[0];
  if (anyClub) {
    ask(
      f,
      { template: "CLUB_SEASON", clubId: anyClub, season: gapSeason },
      `هل لعب لـ${clubs.get(anyClub)} موسم ${gapSeason}؟ (خارج التغطية)`,
    );
  }

  console.log("— الجنسية والمنتخب (NATIONALITY / NATIONAL_TEAM):");
  for (const c of new Set([f.nationalityName, ...CONTROL_COUNTRIES])) {
    ask(f, { template: "NATIONALITY", countryName: c }, `هل جنسيته ${c}؟`);
    ask(f, { template: "NATIONAL_TEAM", countryName: c }, `هل لعب لمنتخب ${c}؟`);
  }

  console.log("— البطولات (COMPETITION_EVER / COMPETITION_SEASON):");
  for (const [leagueId, label] of CONTROL_COMPS) {
    ask(f, { template: "COMPETITION_EVER", leagueId }, `هل لعب في ${label}؟`);
  }
  const compSample = f.competitionSeasons.slice(0, 3);
  for (const cs of compSample) {
    ask(
      f,
      { template: "COMPETITION_SEASON", leagueId: cs.leagueId, season: cs.season },
      `هل لعب في ${comps.get(cs.leagueId) ?? cs.leagueId} موسم ${cs.season}؟`,
    );
  }

  console.log("— الألقاب (TROPHY_*):");
  const seenTrophies = new Set<string>();
  for (const t of f.trophies) {
    const key = `${t.compName}||${t.country}`;
    if (seenTrophies.has(key)) continue;
    seenTrophies.add(key);
    const leagueIds = await gpTrophyLeagueIds(t.compName, t.country);
    const trophy = { compName: t.compName, country: t.country, leagueIds };
    ask(f, { template: "TROPHY_EVER", trophy }, `هل فاز بـ${t.compName}؟`);
    if (t.season !== null) {
      ask(
        f,
        { template: "TROPHY_SEASON", trophy, season: t.season },
        `هل فاز بـ${t.compName} موسم ${t.season}؟`,
      );
      for (const clubId of f.clubIdsEver.filter((c) =>
        f.clubSeasons.some((cs) => cs.clubId === c && cs.season === t.season),
      )) {
        ask(
          f,
          { template: "TROPHY_WITH_CLUB", trophy, clubId },
          `هل فاز بـ${t.compName} مع ${clubs.get(clubId)}؟`,
        );
      }
    }
  }
  if (!seenTrophies.has(`${CONTROL_TROPHY.compName}||${CONTROL_TROPHY.country}`)) {
    ask(
      f,
      { template: "TROPHY_EVER", trophy: CONTROL_TROPHY },
      `هل فاز بـ${CONTROL_TROPHY.compName}؟ (control)`,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const randomIdx = args.indexOf("--random");
  if (randomIdx >= 0) {
    const n = Number(args[randomIdx + 1] ?? 1);
    const tierIdx = args.indexOf("--tier");
    const tier = (tierIdx >= 0 ? args[tierIdx + 1] : "MEDIUM") as GpDifficulty;
    const pool = await gpVsSystemPoolIds(tier);
    console.log(`[gp-spot-check] tier ${tier}: pool=${pool.length} players, sampling ${n}`);
    for (let i = 0; i < n; i++) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (id) await spotCheck(await loadGpFactPack(id));
    }
    return;
  }

  const name = args.join(" ").trim();
  if (!name) {
    console.log('usage: gp:spot-check -- "Player Name"  |  -- --random N --tier EASY|MEDIUM|HARD');
    return;
  }
  const rows = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT id, name FROM football.players
    WHERE name ILIKE ${"%" + name + "%"} OR name_ar ILIKE ${"%" + name + "%"}
    ORDER BY name LIMIT 5
  `);
  if (rows.length === 0) {
    console.log(`no player matches "${name}"`);
    return;
  }
  if (rows.length > 1) console.log(`matches: ${rows.map((r) => r.name).join(" | ")} — using first`);
  await spotCheck(await loadGpFactPack(rows[0]!.id));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
