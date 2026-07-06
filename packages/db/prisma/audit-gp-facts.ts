import "dotenv/config";

import {
  canonicalCountry,
  isYouthOrReserveTeamName,
  parseTrophySeason,
  GP_VS_SYSTEM_MIN_SCORE,
  KNOWN_EXTRA_COUNTRIES,
} from "@fb/guess-player-engine";
import { gpCountryLikeClubNames, gpVsSystemPoolIds } from "../src/gp-facts";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

/**
 * Guess the Player — zero-error data audit (Top Ten catalog-audit style).
 * Re-verifies every assumption the FactPack loader + engine stand on; any
 * FAIL below means the verification engine could emit a wrong YES/NO and the
 * game must NOT go live until it is resolved. Read-only.
 */
let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (!ok) failures++;
}
function info(name: string, detail: string): void {
  console.log(`INFO  ${name} — ${detail}`);
}

async function main(): Promise<void> {
  // 1. Club-name mapping must stay TOTAL (loader joins by lower(name)).
  const tsMap = await prisma.$queryRaw<{ total: number; matched: number }[]>(Prisma.sql`
    SELECT count(DISTINCT ts.team_name)::int AS total,
           count(DISTINCT ts.team_name) FILTER (WHERE c.id IS NOT NULL)::int AS matched
    FROM football.player_team_seasons ts
    LEFT JOIN football.clubs c ON lower(c.name) = lower(ts.team_name)
  `);
  check(
    "team_seasons→clubs name mapping",
    tsMap[0]!.total === tsMap[0]!.matched,
    `${tsMap[0]!.matched}/${tsMap[0]!.total} distinct names map`,
  );
  const ssMap = await prisma.$queryRaw<{ total: number; matched: number }[]>(Prisma.sql`
    SELECT count(DISTINCT s.team_name)::int AS total,
           count(DISTINCT s.team_name) FILTER (WHERE c.id IS NOT NULL)::int AS matched
    FROM football.player_season_stats s
    LEFT JOIN football.clubs c ON lower(c.name) = lower(s.team_name)
    WHERE s.team_name IS NOT NULL
  `);
  check(
    "season_stats→clubs name mapping",
    ssMap[0]!.total === ssMap[0]!.matched,
    `${ssMap[0]!.matched}/${ssMap[0]!.total} distinct names map`,
  );

  // 2. Import completeness — the foundation of every trophy/NT "NO".
  const prog = await prisma.$queryRaw<{ endpoint: string; ok: number }[]>(Prisma.sql`
    SELECT endpoint, count(*)::int AS ok
    FROM football._apifootball_import_progress WHERE status = 'ok' GROUP BY endpoint
  `);
  const playerCount = await prisma.$queryRaw<{ n: number }[]>(
    Prisma.sql`SELECT count(*)::int AS n FROM football.players WHERE external_ref IS NOT NULL`,
  );
  for (const ep of ["teams", "trophies"]) {
    const ok = prog.find((p) => p.endpoint === ep)?.ok ?? 0;
    check(
      `${ep} import coverage`,
      ok === playerCount[0]!.n,
      `${ok}/${playerCount[0]!.n} players status=ok`,
    );
  }

  // 3. NT-candidate names must canonicalize to a known country (alias map
  //    honesty check). Youth/"B" names are expected and filtered; anything
  //    else unmatched would silently weaken NATIONAL_TEAM answers.
  const countryRows = await prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
    SELECT name FROM football.nationalities
    UNION SELECT name FROM football.clubs WHERE kind = 'NATIONAL_TEAM'
  `);
  const countryKeys = new Set([
    ...countryRows.map((r) => canonicalCountry(r.name)),
    ...KNOWN_EXTRA_COUNTRIES.map((c) => canonicalCountry(c)),
  ]);
  const ntNames = await prisma.$queryRaw<{ team_name: string }[]>(Prisma.sql`
    SELECT DISTINCT s.team_name
    FROM football.player_season_stats s
    JOIN football.competition_dim d ON d.league_id = s.league_id AND d.category = 'NATIONAL_SENIOR'
    WHERE s.team_name IS NOT NULL
  `);
  const unmatched = ntNames
    .map((r) => r.team_name)
    .filter((n) => !isYouthOrReserveTeamName(n) && !countryKeys.has(canonicalCountry(n)));
  // Club sides leak into NATIONAL_SENIOR comps (e.g. friendlies data); they
  // never match a country so they are harmlessly ignored — but list them so a
  // genuinely missing alias is caught by eye.
  info("NT names not matching any country (ignored as non-NT)", unmatched.join(", ") || "none");
  const suspicious = unmatched.filter((n) => /land$|stan$|ia$/i.test(n));
  check(
    "no country-looking NT name lacks an alias",
    suspicious.length === 0,
    suspicious.join(", ") || "clean",
  );

  // 4. Trophy season parse coverage over Winner rows (dated rows only).
  const trophySeasons = await prisma.$queryRaw<{ season: string; n: number }[]>(Prisma.sql`
    SELECT season, count(*)::int AS n FROM football.player_trophies
    WHERE place = 'Winner' AND season IS NOT NULL AND season <> ''
    GROUP BY season
  `);
  const unparseable = trophySeasons.filter((r) => parseTrophySeason(r.season) === null);
  const unparseableRows = unparseable.reduce((a, r) => a + r.n, 0);
  const totalRows = trophySeasons.reduce((a, r) => a + r.n, 0);
  check(
    "trophy season text parses",
    unparseableRows === 0,
    unparseableRows === 0
      ? `${totalRows}/${totalRows} dated Winner rows parse`
      : `${unparseableRows}/${totalRows} rows unparseable: ${unparseable
          .slice(0, 10)
          .map((r) => JSON.stringify(r.season))
          .join(", ")}`,
  );

  // 5. Famous internationals sanity: every score>=70 player should show senior
  //    NT evidence via the loader's union (this is the Yaya Touré/Marcelo
  //    regression check — player_national_teams alone was NOT sufficient).
  const famous = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT p.id, p.name FROM football.players p
    JOIN football.player_score ps ON ps.player_id = p.id
    WHERE ps.score >= 70
  `);
  const noNt: string[] = [];
  for (const p of famous) {
    const rows = await prisma.$queryRaw<{ team_name: string }[]>(Prisma.sql`
      SELECT DISTINCT s.team_name
      FROM football.player_season_stats s
      JOIN football.competition_dim d ON d.league_id = s.league_id AND d.category = 'NATIONAL_SENIOR'
      WHERE s.player_id = ${p.id}::uuid AND s.team_name IS NOT NULL
      UNION
      SELECT c.name FROM football.player_national_teams pn
      JOIN football.clubs c ON c.id = pn.club_id AND c.kind = 'NATIONAL_TEAM'
      WHERE pn.player_id = ${p.id}::uuid
      UNION
      SELECT DISTINCT ts.team_name FROM football.player_team_seasons ts
      WHERE ts.player_id = ${p.id}::uuid
    `);
    const hasNt = rows.some(
      (r) => !isYouthOrReserveTeamName(r.team_name) && countryKeys.has(canonicalCountry(r.team_name)),
    );
    if (!hasNt) noNt.push(p.name);
  }
  // A score>=70 player with genuinely zero caps is possible but rare — treat
  // as INFO unless it explodes.
  check(
    "famous players show senior NT evidence",
    noNt.length <= 3,
    noNt.length ? `${noNt.length} without: ${noNt.join(", ")}` : `all ${famous.length} covered`,
  );

  // 6. VS_SYSTEM pool answerability — exercised through the REAL loader
  //    function: every dealable player must have club facts (a hidden player
  //    nobody can ask about would dead-end the round).
  const pool = new Set([
    ...(await gpVsSystemPoolIds("EASY")),
    ...(await gpVsSystemPoolIds("MEDIUM")),
    ...(await gpVsSystemPoolIds("HARD")),
  ]);
  const clubless = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT p.id, p.name
    FROM football.players p
    WHERE NOT EXISTS (
      SELECT 1 FROM football.player_team_seasons ts
      JOIN football.clubs c ON lower(c.name) = lower(ts.team_name) AND c.kind = 'CLUB'
      WHERE ts.player_id = p.id
    )
  `);
  const dealtClubless = clubless.filter((p) => pool.has(p.id));
  check(
    "VS_SYSTEM pool has club facts",
    dealtClubless.length === 0,
    dealtClubless.length
      ? dealtClubless.map((p) => p.name).join(", ")
      : `pool=${pool.size} players (score>=${GP_VS_SYSTEM_MIN_SCORE}); ${clubless.length} clubless players excluded by the pool filter`,
  );

  // 6b. Country-named kind=CLUB rows (importer misclassifications, e.g.
  //     "Ivory Coast"). The loader excludes them from ALL club facts; a new
  //     name appearing here is handled automatically but worth eyeballing.
  const pseudoClubs = await gpCountryLikeClubNames();
  info(
    "country-named pseudo-clubs excluded from club facts",
    pseudoClubs.join(", ") || "none",
  );

  // 7. Null-league stat lines (pre-2010): informational scale of the
  //    COMPETITION_SEASON UNKNOWN degradation.
  const nullLeague = await prisma.$queryRaw<{ players: number; lines: number }[]>(Prisma.sql`
    SELECT count(DISTINCT player_id)::int AS players, count(*)::int AS lines
    FROM football.player_season_stats WHERE league_id IS NULL
  `);
  info(
    "null-league stat lines (degrade to UNKNOWN, never NO)",
    `${nullLeague[0]!.lines} lines across ${nullLeague[0]!.players} players`,
  );

  // 8. Nationality near-duplicates: both spellings must canonicalize together
  //    (NATIONALITY compares canonical names, not ids).
  const natNames = await prisma.$queryRaw<{ name: string }[]>(
    Prisma.sql`SELECT name FROM football.nationalities`,
  );
  const byKey = new Map<string, string[]>();
  for (const r of natNames) {
    const k = canonicalCountry(r.name);
    byKey.set(k, [...(byKey.get(k) ?? []), r.name]);
  }
  const merged = [...byKey.values()].filter((v) => v.length > 1);
  info(
    "nationality spelling variants folded by canonicalization",
    merged.map((v) => v.join(" = ")).join("; ") || "none",
  );

  console.log(failures === 0 ? "\nAUDIT CLEAN" : `\nAUDIT FAILED — ${failures} check(s)`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
