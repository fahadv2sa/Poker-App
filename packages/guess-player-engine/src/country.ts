/**
 * Country-name canonicalization for national-team and nationality proofs.
 *
 * Why this exists (verified against the live data, 2026-07-05):
 *  - The API uses different spellings for the same country across endpoints:
 *    season stats say "Ivory Coast" / "South Korea" while nationalities and
 *    NT club rows say "Côte d'Ivoire" / "Korea Republic".
 *  - The nationalities table itself contains near-duplicates
 *    (Czechia / Czech Republic, Cape Verde Islands / Cape Verde), so
 *    nationality equality must compare canonical NAMES, not row ids.
 *  - Youth ("Belgium U21") and reserve ("Algeria B") national sides — and
 *    even club rows ("Liverpool") — leak into NATIONAL_SENIOR-classified
 *    stat lines, so a name is only senior-NT evidence after filtering.
 *
 * The audit script (packages/db/prisma/audit-gp-facts.ts) enumerates every
 * NT-candidate name that fails to canonicalize to a known country, so this
 * alias map is kept honest by data, not by hope.
 */

/** Alias → canonical (keys/values in comparison form: lowercased, trimmed,
 *  diacritics stripped). Canonical side = the football.nationalities spelling. */
const COUNTRY_ALIASES: Record<string, string> = {
  "ivory coast": "cote d'ivoire",
  "south korea": "korea republic",
  "north korea": "korea dpr",
  "fyr macedonia": "north macedonia",
  "bosnia & herzegovina": "bosnia and herzegovina",
  "rep. of ireland": "republic of ireland",
  "ireland": "republic of ireland",
  "china": "china pr",
  "czechia": "czech republic",
  "cape verde islands": "cape verde",
  "dr congo": "congo dr",
  "united states": "usa",
  "türkiye": "turkey",
  "turkiye": "turkey",
};

/**
 * Real countries/territories with national teams that appear in stat lines
 * but have NO row in football.nationalities (no player of that nationality)
 * nor a kind=NATIONAL_TEAM club row. Verified against the audit's unmatched
 * list (2026-07-05) — without these, a naturalized player's NT stint (e.g.
 * for Syria) would be silently dropped from his FactPack. Comparison form.
 */
export const KNOWN_EXTRA_COUNTRIES: readonly string[] = [
  "syria",
  "palestine",
  "united arab emirates",
  "south sudan",
  "bangladesh",
  "french guyana",
  "saint martin",
  "antigua and barbuda",
  "american samoa",
];

/** Curated Arabic names for the KNOWN_EXTRA countries (they have no
 *  nationalities/NT-club row to store a name on). Keys = comparison form. */
export const KNOWN_EXTRA_COUNTRIES_AR: Record<string, string> = {
  syria: "سوريا",
  palestine: "فلسطين",
  "united arab emirates": "الإمارات",
  "south sudan": "جنوب السودان",
  bangladesh: "بنغلاديش",
  "french guyana": "غويانا الفرنسية",
  "saint martin": "سانت مارتن",
  "antigua and barbuda": "أنتيغوا وباربودا",
  "american samoa": "ساموا الأمريكية",
};

/** Lowercase, trim, collapse whitespace, strip diacritics (é→e, ô→o …). */
export function comparableCountry(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical comparison key for a country name (alias-resolved). */
export function canonicalCountry(name: string): string {
  const c = comparableCountry(name);
  return COUNTRY_ALIASES[c] ?? c;
}

/** Same country, tolerant of spelling variants across data sources. */
export function sameCountry(a: string, b: string): boolean {
  return canonicalCountry(a) === canonicalCountry(b);
}

/**
 * True for youth / reserve national-side names that must NEVER count as
 * senior national-team evidence: "Belgium U21", "France U-19", "Algeria B",
 * "Morocco B", "Spain U18" …
 */
export function isYouthOrReserveTeamName(name: string): boolean {
  return /\bU-?\d{1,2}\b/i.test(name) || /\s(B|II)$/.test(name.trim());
}
