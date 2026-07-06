import type { GpFactPack } from "../src/types.js";

/** A deterministic synthetic player for unit tests: career = Ajax 2015–2017,
 *  Liverpool 2018–2021 (with a mid-season 2019 loan overlap at Everton),
 *  Egyptian, senior NT for Egypt, PL (39) + UCL (2) competitions, winner of
 *  the UCL 2018/2019 and one undated domestic cup. */
export const AJAX = "club-ajax";
export const LIVERPOOL = "club-liverpool";
export const EVERTON = "club-everton";
export const REAL_MADRID = "club-real-madrid";
export const PL = 39;
export const UCL = 2;
export const ERE = 88;

export function factPack(overrides: Partial<GpFactPack> = {}): GpFactPack {
  return {
    playerId: "p1",
    name: "Test Player",
    nameAr: "لاعب تجريبي",
    nationalityName: "Egypt",
    clubIdsEver: [AJAX, LIVERPOOL, EVERTON],
    clubSeasons: [
      { clubId: AJAX, season: 2015 },
      { clubId: AJAX, season: 2016 },
      { clubId: AJAX, season: 2017 },
      { clubId: LIVERPOOL, season: 2018 },
      { clubId: LIVERPOOL, season: 2019 },
      { clubId: EVERTON, season: 2019 },
      { clubId: LIVERPOOL, season: 2020 },
      { clubId: LIVERPOOL, season: 2021 },
    ],
    seasonsWithClubData: [2015, 2016, 2017, 2018, 2019, 2020, 2021],
    nationalTeamCountries: ["Egypt"],
    nationalTeamsComplete: true,
    competitionIdsEver: [PL, UCL, ERE],
    competitionSeasons: [
      { leagueId: ERE, season: 2015 },
      { leagueId: ERE, season: 2016 },
      { leagueId: ERE, season: 2017 },
      { leagueId: PL, season: 2018 },
      { leagueId: PL, season: 2019 },
      { leagueId: PL, season: 2020 },
      { leagueId: PL, season: 2021 },
      { leagueId: UCL, season: 2018 },
      { leagueId: UCL, season: 2019 },
    ],
    seasonsWithCompleteCompetitionData: [2015, 2016, 2017, 2018, 2019, 2020, 2021],
    seasonLines: [
      { leagueId: ERE, clubId: AJAX, season: 2015 },
      { leagueId: ERE, clubId: AJAX, season: 2016 },
      { leagueId: ERE, clubId: AJAX, season: 2017 },
      { leagueId: PL, clubId: LIVERPOOL, season: 2018 },
      { leagueId: PL, clubId: LIVERPOOL, season: 2019 },
      { leagueId: PL, clubId: EVERTON, season: 2019 },
      { leagueId: PL, clubId: LIVERPOOL, season: 2020 },
      { leagueId: PL, clubId: LIVERPOOL, season: 2021 },
      { leagueId: UCL, clubId: LIVERPOOL, season: 2018 },
      { leagueId: UCL, clubId: LIVERPOOL, season: 2019 },
    ],
    trophies: [
      { compName: "UEFA Champions League", country: "World", season: 2018 },
      { compName: "FA Cup", country: "England", season: null },
    ],
    trophiesImported: true,
    ...overrides,
  };
}

export const UCL_TROPHY = { compName: "UEFA Champions League", country: "World" };
export const FA_CUP = { compName: "FA Cup", country: "England" };
export const PREMIER_LEAGUE_TROPHY = { compName: "Premier League", country: "England" };
