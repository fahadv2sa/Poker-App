import { canonicalCountry, KNOWN_EXTRA_COUNTRIES, KNOWN_EXTRA_COUNTRIES_AR } from "@fb/guess-player-engine";
import { prisma } from "./client";
import { Prisma } from "./generated/client";
import { gpCountryLikeClubNames, gpTrophyLeagueIds } from "./gp-facts";

/**
 * Guess the Player — question-entity RESOLUTION + VALIDATION (the second half
 * of the football read seam). Every entity a client submits with a question
 * is re-validated here against the reference data before the engine answers;
 * an unresolvable entity rejects the question (no turn consumed, no answer).
 * This is what keeps the wire contract id-based rather than free-text: the
 * client can only ever name things that actually exist.
 *
 * Each resolver returns the frozen display label(s) persisted with the
 * question (GpQuestion.params), so history stays self-contained.
 */

// ARABIC-ONLY POLICY (owner ruling 2026-07-06): an entity without a VERIFIED
// Arabic name does not exist for the question system — excluded from pickers,
// search results, and sentences (resolvers return null). English typed input
// still MATCHES entities; only the display is Arabic. The engine's FACTS are
// unaffected (a hidden player's unnamed club still answers CLUB_EVER
// correctly by id — it just can't be picked in the composer).
export interface GpClubRef {
  id: string;
  name: string;
  /** VERIFIED Arabic name — always present (Arabic-only policy). */
  nameAr: string;
}
export interface GpCompetitionRef {
  leagueId: number;
  name: string;
  /** VERIFIED Arabic name — always present (Arabic-only policy). */
  nameAr: string;
  /** Equivalent league ids merged into this competition (engine matches all). */
  altLeagueIds: number[];
  /** National-team tournament (WC/Euro/Copa/qualifiers…) — its seasons run in
   *  a single calendar year, so the display label is "2018", never "2018/19". */
  isNational: boolean;
}
export interface GpTrophyRefResolved {
  compName: string;
  country: string;
  /** VERIFIED Arabic name — always present (Arabic-only policy). */
  nameAr: string;
  leagueIds: number[];
  /** Equivalent identities merged into this trophy (engine matches all). */
  altKeys: { compName: string; country: string }[];
  /** National-team trophy (single-calendar-year season label — see
   *  GpCompetitionRef.isNational). */
  isNational: boolean;
}
export interface GpPlayerRef {
  id: string;
  name: string;
  nameAr: string | null;
  photoUrl: string | null;
}

/** A real club (kind=CLUB, and not a country-named pseudo-club). */
export async function gpResolveClub(clubId: string): Promise<GpClubRef | null> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; name_ar: string | null; v: boolean }[]
  >(Prisma.sql`
    SELECT id, name, name_ar, name_ar_verified AS v
    FROM football.clubs WHERE id = ${clubId}::uuid AND kind = 'CLUB'
  `);
  const club = rows[0];
  if (!club) return null;
  if (!club.v || !club.name_ar) return null; // Arabic-only: unnamed = unaskable
  const pseudo = await gpCountryLikeClubNames();
  if (pseudo.some((n) => n.toLowerCase() === club.name.toLowerCase())) return null;
  return { id: club.id, name: club.name, nameAr: club.name_ar };
}

/** A known competition (non-youth) from competition_dim, with its VERIFIED
 *  Arabic name (competition_names_ar survives dim rebuilds). An asked variant
 *  id CANONICALIZES first (competition_aliases); every variant id rides along
 *  as altLeagueIds so the engine matches all equivalent identities. */
export async function gpResolveCompetition(leagueId: number): Promise<GpCompetitionRef | null> {
  const alias = await prisma.competitionAlias.findUnique({ where: { leagueId } });
  const canonicalId = alias?.canonicalLeagueId ?? leagueId;
  const rows = await prisma.$queryRaw<
    { league_id: number; comp_name: string; name_ar: string; is_national: boolean }[]
  >(Prisma.sql`
    SELECT d.league_id, d.comp_name, a.name_ar, d.is_national
    FROM football.competition_dim d
    JOIN football.competition_names_ar a ON a.league_id = d.league_id AND a.verified = true
    WHERE d.league_id = ${canonicalId} AND d.is_youth = false
  `);
  if (!rows[0]) return null;
  const variants = await prisma.competitionAlias.findMany({
    where: { canonicalLeagueId: canonicalId },
    select: { leagueId: true },
  });
  return {
    leagueId: rows[0].league_id,
    name: rows[0].comp_name,
    nameAr: rows[0].name_ar,
    altLeagueIds: variants.map((v) => v.leagueId),
    isNational: rows[0].is_national,
  };
}

/** A known country, returned as its canonical spelling + VERIFIED Arabic.
 *  Matching is alias/diacritic-tolerant (the engine's canonicalization), so
 *  "Ivory Coast" and "Côte d'Ivoire" resolve to the same country. Includes
 *  the KNOWN_EXTRA countries (e.g. Syria) that have NT evidence but no
 *  nationalities/NT-club row. */
export async function gpResolveCountry(
  name: string,
): Promise<{ name: string; nameAr: string } | null> {
  const rows = await prisma.$queryRaw<{ name: string; name_ar: string | null }[]>(Prisma.sql`
    SELECT n.name, CASE WHEN n.name_ar_verified THEN n.name_ar END AS name_ar
    FROM football.nationalities n
    UNION
    SELECT c.name, CASE WHEN c.name_ar_verified THEN c.name_ar END AS name_ar
    FROM football.clubs c WHERE c.kind = 'NATIONAL_TEAM'
  `);
  const key = canonicalCountry(name);
  const hit = rows.find((r) => canonicalCountry(r.name) === key);
  // Arabic-only: a country without a verified Arabic name is unaskable
  // (all 145 + the extras are curated, so this only guards future rows).
  if (hit) return hit.name_ar ? { name: hit.name, nameAr: hit.name_ar } : null;
  const extra = KNOWN_EXTRA_COUNTRIES.find((e) => canonicalCountry(e) === key);
  if (extra && KNOWN_EXTRA_COUNTRIES_AR[extra]) {
    return {
      name: extra.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      nameAr: KNOWN_EXTRA_COUNTRIES_AR[extra]!,
    };
  }
  return null;
}

/** An ACTIVE whitelist trophy (gp_askable_trophies), with its narrowing
 *  league ids resolved. Identity must match the whitelist row exactly —
 *  that row's (comp_name, country) is also trophy_dim's identity, which is
 *  what the FactPack's trophy rows carry. Arabic label only when VERIFIED. */
export async function gpResolveTrophy(
  compName: string,
  country: string,
): Promise<GpTrophyRefResolved | null> {
  const row = await prisma.gpAskableTrophy.findFirst({
    where: {
      compName: { equals: compName.trim(), mode: "insensitive" },
      country: { equals: country.trim(), mode: "insensitive" },
      active: true,
    },
  });
  if (!row) return null;
  if (!row.nameArVerified || !row.nameAr) return null; // Arabic-only policy
  // Equivalent identities merged into this trophy: their (comp_name, country)
  // become engine altKeys, and their league ids extend the narrowing set.
  const variants = await prisma.gpAskableTrophy.findMany({
    where: { mergedIntoId: row.id },
    select: { compName: true, country: true },
  });
  const [leagueIdSets, dim] = await Promise.all([
    Promise.all([
      gpTrophyLeagueIds(row.compName, row.country),
      ...variants.map((v) => gpTrophyLeagueIds(v.compName, v.country)),
    ]),
    // The whitelist row's (comp_name, country) IS trophy_dim's identity.
    prisma.$queryRaw<{ is_national: boolean }[]>(Prisma.sql`
      SELECT is_national FROM football.trophy_dim
      WHERE comp_name = ${row.compName} AND country = ${row.country}
    `),
  ]);
  return {
    compName: row.compName,
    country: row.country,
    nameAr: row.nameAr,
    leagueIds: [...new Set(leagueIdSets.flat())],
    altKeys: variants,
    isNational: dim[0]?.is_national ?? false,
  };
}

/** Any active player (guesses + VS_HUMANS picks search the FULL DB). */
export async function gpResolvePlayer(playerId: string): Promise<GpPlayerRef | null> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; name_ar: string | null; photo_url: string | null }[]
  >(Prisma.sql`
    SELECT id, name, name_ar, photo_url FROM football.players
    WHERE id = ${playerId}::uuid AND active = true
  `);
  return rows[0]
    ? { id: rows[0].id, name: rows[0].name, nameAr: rows[0].name_ar, photoUrl: rows[0].photo_url }
    : null;
}
