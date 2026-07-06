/**
 * Season display — the ONE formatting core for every game (owner ruling
 * 2026-07-06: Guess the Player must render seasons exactly like Top Ten,
 * from one shared source of truth).
 *
 * The stored season value is API-Football's season key: the calendar year
 * the season STARTS in (verified against known careers, e.g. Salah's first
 * Liverpool row is season=2017 → the 2017/18 season). Display:
 *  - cross-calendar competitions (the default; European club football runs
 *    Aug→May): "2020/21" — start year, slash, two-digit end year.
 *  - single-calendar-year competitions (summer national tournaments — the
 *    World Cup, Euro, Copa América, qualifiers…): "2018" — there is no
 *    "World Cup 2018/19". Callers decide via `singleYear` from data they
 *    can prove (league ids / is_national flags), never by guessing.
 */
export function fbSeasonLabel(season: number, opts?: { singleYear?: boolean }): string {
  return opts?.singleYear
    ? `${season}`
    : `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
}
