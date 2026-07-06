/**
 * Trophy-season parsing. football.player_trophies.season is free text from
 * the API; the observed formats (verified against all 68,375 rows) are:
 *   "2018/2019"              → cross-year season, start year 2018
 *   "2013"                   → calendar-year season / tournament year
 *   "2012 Poland/Ukraine"    → tournament year + host country (Euro/WC/…)
 *   ""                       → proven duplicates of dated rows (excluded by
 *                              the loader, per the build-totals analysis)
 *
 * The parsed value is the START year — the same convention as the API season
 * integer used by player_team_seasons / player_season_stats, so seasons are
 * directly comparable across domains ("2018/2019" ⇔ season 2018).
 *
 * Anything unparseable returns null; verify.ts then refuses to prove a
 * season-specific negative from that row (UNKNOWN, never a guessed NO).
 */
export function parseTrophySeason(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.trim();
  // "2018/2019" (also tolerates "2018/19")
  let m = /^(\d{4})\s*\/\s*\d{2,4}$/.exec(t);
  if (m) return Number(m[1]);
  // "2013"
  m = /^(\d{4})$/.exec(t);
  if (m) return Number(m[1]);
  // "2012 Poland/Ukraine", "2014 Brazil", "2015 Equatorial Guin…"
  m = /^(\d{4})\s+\S/.exec(t);
  if (m) return Number(m[1]);
  // "2002/2003 Clausura", "2012/2013 Torneo Fin…" (LatAm half-season labels)
  m = /^(\d{4})\s*\/\s*\d{2,4}\s+\S/.exec(t);
  if (m) return Number(m[1]);
  // "Venezuela 2009" (host country BEFORE the year)
  m = /\s(\d{4})$/.exec(t);
  if (m) return Number(m[1]);
  return null;
}
