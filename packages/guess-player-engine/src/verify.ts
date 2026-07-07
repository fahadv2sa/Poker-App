import { canonicalCountry, sameCountry } from "./country.js";
import type { GpAnswer, GpFactPack, GpQuestion, GpTrophyRef, GpTrophyWin } from "./types.js";

/**
 * The question-verification engine — one pure function of (question, FactPack).
 *
 * ZERO-ERROR RULE (locked): a wrong YES/NO ruins the round, so every branch
 * below answers YES or NO only when the data PROVES it, and UNKNOWN otherwise.
 * The load-bearing asymmetries, per domain:
 *
 *  - Nationality: players.nationality_id is a required column → always
 *    provable both ways (compared by canonical NAME because the nationalities
 *    table contains spelling near-duplicates).
 *  - Clubs (ever): player_clubs ∪ player_team_seasons is the player's career
 *    club list from the completed teams import (verified: import status 'ok'
 *    for all 8,228 players) → YES and NO both provable. This is the same
 *    career-completeness assumption Link Up's rank engine already stands on.
 *  - Club in season S: YES from a recorded (club, season) row. NO only when
 *    the player is recorded at SOME club in S (so his absence from the asked
 *    club is witnessed, not inferred). No record at all in S — inactive year,
 *    pre-coverage career, injury gap — is UNKNOWN, never NO.
 *  - Competitions: same shape, with one extra guard — pre-2010 stat lines can
 *    carry a NULL league id, so a NO is only provable for seasons where ALL
 *    of the player's lines have a known league (seasonsWithCompleteCompetitionData).
 *  - National team: evidence is unioned from three sources and canonicalized
 *    (see country.ts); NO additionally requires the completed-import flag.
 *  - Trophies: the trophies import completed for every player (status 'ok'
 *    8,228/8,228), so zero rows genuinely means zero trophies → NO is safe
 *    when trophiesImported; without the flag every negative degrades to
 *    UNKNOWN. Season-specific negatives additionally require every win row
 *    to carry a parseable season (an undated win can never prove "not in S").
 *  - Trophy with club: the trophy rows carry NO club, so attribution is
 *    derived: the win's season must map to exactly ONE of the player's clubs
 *    (optionally narrowed to clubs that appear in that competition that
 *    season). Any ambiguity — mid-season transfer, undated win — is UNKNOWN.
 *
 * UNKNOWN is surfaced to players as "لا يمكن الإجابة" and does NOT consume
 * the turn (locked rule).
 */
export function answerQuestion(q: GpQuestion, f: GpFactPack): GpAnswer {
  switch (q.template) {
    case "CLUB_EVER":
      return f.clubIdsEver.includes(q.clubId) ? "YES" : "NO";

    case "CLUB_SEASON": {
      const played = f.clubSeasons.some((cs) => cs.clubId === q.clubId && cs.season === q.season);
      if (played) return "YES";
      return f.seasonsWithClubData.includes(q.season) ? "NO" : "UNKNOWN";
    }

    case "NATIONALITY":
      return sameCountry(f.nationalityName, q.countryName) ? "YES" : "NO";

    case "NATIONAL_TEAM": {
      const asked = canonicalCountry(q.countryName);
      const played = f.nationalTeamCountries.some((c) => canonicalCountry(c) === asked);
      if (played) return "YES";
      return f.nationalTeamsComplete ? "NO" : "UNKNOWN";
    }

    case "CONTINENT": {
      // Confederation membership by RULE (curated table), never geography.
      // An unmapped nationality can prove nothing — UNKNOWN (zero-error).
      if (!f.confederation) return "UNKNOWN";
      return f.confederation === q.confederation ? "YES" : "NO";
    }

    case "COMPETITION_EVER": {
      const ids = [q.leagueId, ...(q.altLeagueIds ?? [])];
      return f.competitionIdsEver.some((id) => ids.includes(id)) ? "YES" : "NO";
    }

    case "COMPETITION_SEASON": {
      const ids = [q.leagueId, ...(q.altLeagueIds ?? [])];
      const played = f.competitionSeasons.some(
        (cs) => ids.includes(cs.leagueId) && cs.season === q.season,
      );
      if (played) return "YES";
      return f.seasonsWithCompleteCompetitionData.includes(q.season) ? "NO" : "UNKNOWN";
    }

    case "TROPHY_EVER": {
      if (winsFor(q.trophy, f).length > 0) return "YES";
      return f.trophiesImported ? "NO" : "UNKNOWN";
    }

    case "TROPHY_SEASON": {
      const wins = winsFor(q.trophy, f);
      if (wins.some((w) => w.season === q.season)) return "YES";
      // An undated win might BE season S — cannot prove the negative.
      if (wins.some((w) => w.season === null)) return "UNKNOWN";
      return f.trophiesImported ? "NO" : "UNKNOWN";
    }

    case "TROPHY_WITH_CLUB": {
      // Winning with club X requires having played for X; the club-career
      // domain is complete, so this NO stands even without the trophy flag.
      if (!f.clubIdsEver.includes(q.clubId)) return "NO";
      const wins = winsFor(q.trophy, f);
      if (wins.length === 0) return f.trophiesImported ? "NO" : "UNKNOWN";
      let anyUnresolved = false;
      for (const w of wins) {
        const resolved = resolveWinningClub(w, q.trophy, f);
        if (resolved === null) anyUnresolved = true;
        else if (resolved === q.clubId) return "YES";
      }
      return anyUnresolved ? "UNKNOWN" : "NO";
    }
  }
}

/** Trophy identity match: trophy_dim's (comp_name, country), whitespace/case
 *  tolerant, across the trophy's EQUIVALENT identities (altKeys) — the same
 *  real trophy exists under variant source strings and a win under any of
 *  them counts. No fuzzier matching is allowed (zero-error): equivalence is
 *  curated data, never string similarity. */
function winsFor(t: GpTrophyRef, f: GpFactPack): GpTrophyWin[] {
  const keys = [
    { compName: t.compName, country: t.country },
    ...(t.altKeys ?? []),
  ].map((k) => ({
    name: k.compName.trim().toLowerCase(),
    country: k.country.trim().toLowerCase(),
  }));
  return f.trophies.filter((w) => {
    const wn = w.compName.trim().toLowerCase();
    const wc = w.country.trim().toLowerCase();
    return keys.some((k) => k.name === wn && k.country === wc);
  });
}

/**
 * Attribute one trophy win to a club, or null when the data cannot prove it:
 *  1. undated win → null;
 *  2. exactly one club that season → that club;
 *  3. several clubs (mid-season transfer): if the trophy resolves to known
 *     league ids, narrow to the candidate clubs that actually appear in that
 *     competition that season — accept only a UNIQUE survivor;
 *  4. otherwise null.
 */
function resolveWinningClub(w: GpTrophyWin, t: GpTrophyRef, f: GpFactPack): string | null {
  if (w.season === null) return null;
  const season = w.season;
  const candidates = [
    ...new Set(f.clubSeasons.filter((cs) => cs.season === season).map((cs) => cs.clubId)),
  ];
  if (candidates.length === 1) return candidates[0] ?? null;
  if (candidates.length === 0) return null;
  if (t.leagueIds && t.leagueIds.length > 0) {
    const inComp = new Set(
      f.seasonLines
        .filter(
          (l) => l.season === season && l.clubId !== null && t.leagueIds!.includes(l.leagueId),
        )
        .map((l) => l.clubId as string),
    );
    const narrowed = candidates.filter((c) => inComp.has(c));
    if (narrowed.length === 1) return narrowed[0] ?? null;
  }
  return null;
}
