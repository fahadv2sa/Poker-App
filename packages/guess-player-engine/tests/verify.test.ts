import { describe, expect, it } from "vitest";
import { answerQuestion } from "../src/verify.js";
import {
  AJAX,
  FA_CUP,
  LIVERPOOL,
  PL,
  PREMIER_LEAGUE_TROPHY,
  REAL_MADRID,
  UCL,
  UCL_TROPHY,
  factPack,
} from "./helpers.js";

describe("CLUB_EVER", () => {
  it("YES for a career club", () => {
    expect(answerQuestion({ template: "CLUB_EVER", clubId: LIVERPOOL }, factPack())).toBe("YES");
  });
  it("NO for a club never played for (career list is complete)", () => {
    expect(answerQuestion({ template: "CLUB_EVER", clubId: REAL_MADRID }, factPack())).toBe("NO");
  });
});

describe("CLUB_SEASON", () => {
  it("YES when the (club, season) row exists", () => {
    expect(
      answerQuestion({ template: "CLUB_SEASON", clubId: LIVERPOOL, season: 2019 }, factPack()),
    ).toBe("YES");
  });
  it("NO when he is recorded at another club that season", () => {
    expect(
      answerQuestion({ template: "CLUB_SEASON", clubId: LIVERPOOL, season: 2016 }, factPack()),
    ).toBe("NO");
  });
  it("UNKNOWN for a season with no recorded club at all (gap ≠ NO)", () => {
    expect(
      answerQuestion({ template: "CLUB_SEASON", clubId: LIVERPOOL, season: 2010 }, factPack()),
    ).toBe("UNKNOWN");
  });
});

describe("NATIONALITY", () => {
  it("YES on canonical-name match", () => {
    expect(answerQuestion({ template: "NATIONALITY", countryName: "Egypt" }, factPack())).toBe(
      "YES",
    );
  });
  it("YES across spelling variants (Czechia vs Czech Republic)", () => {
    const f = factPack({ nationalityName: "Czechia" });
    expect(answerQuestion({ template: "NATIONALITY", countryName: "Czech Republic" }, f)).toBe(
      "YES",
    );
  });
  it("NO for another country", () => {
    expect(answerQuestion({ template: "NATIONALITY", countryName: "Brazil" }, factPack())).toBe(
      "NO",
    );
  });
});

describe("NATIONAL_TEAM", () => {
  it("YES for the senior NT (alias-tolerant: Ivory Coast = Côte d'Ivoire)", () => {
    const f = factPack({ nationalTeamCountries: ["Ivory Coast"] });
    expect(answerQuestion({ template: "NATIONAL_TEAM", countryName: "Côte d'Ivoire" }, f)).toBe(
      "YES",
    );
  });
  it("NO when evidence is complete and the country is absent", () => {
    expect(
      answerQuestion({ template: "NATIONAL_TEAM", countryName: "Brazil" }, factPack()),
    ).toBe("NO");
  });
  it("UNKNOWN when the teams import did not complete for this player", () => {
    const f = factPack({ nationalTeamCountries: [], nationalTeamsComplete: false });
    expect(answerQuestion({ template: "NATIONAL_TEAM", countryName: "Brazil" }, f)).toBe("UNKNOWN");
  });
});

describe("CONTINENT (confederation by rule, never geography)", () => {
  it("YES/NO from the curated confederation on the pack", () => {
    const f = factPack({ confederation: "UEFA" });
    expect(answerQuestion({ template: "CONTINENT", confederation: "UEFA" }, f)).toBe("YES");
    expect(answerQuestion({ template: "CONTINENT", confederation: "CAF" }, f)).toBe("NO");
  });
  it("transcontinental cases resolve by MEMBERSHIP (Australia → AFC, i.e. آسيا)", () => {
    const f = factPack({ nationalityName: "Australia", confederation: "AFC" });
    expect(answerQuestion({ template: "CONTINENT", confederation: "AFC" }, f)).toBe("YES");
    expect(answerQuestion({ template: "CONTINENT", confederation: "OFC" }, f)).toBe("NO");
  });
  it("UNKNOWN when the nationality is not in the curated mapping (zero-error)", () => {
    expect(
      answerQuestion({ template: "CONTINENT", confederation: "UEFA" }, factPack({ confederation: null })),
    ).toBe("UNKNOWN");
    // …and for packs frozen before the field existed (absent entirely).
    const legacy = factPack();
    delete (legacy as { confederation?: string | null }).confederation;
    expect(answerQuestion({ template: "CONTINENT", confederation: "UEFA" }, legacy)).toBe("UNKNOWN");
  });
});

describe("COMPETITION_EVER / COMPETITION_SEASON", () => {
  it("EVER: YES / NO from the complete competition set", () => {
    expect(answerQuestion({ template: "COMPETITION_EVER", leagueId: UCL }, factPack())).toBe("YES");
    expect(answerQuestion({ template: "COMPETITION_EVER", leagueId: 140 }, factPack())).toBe("NO");
  });
  it("SEASON: YES when the pair exists", () => {
    expect(
      answerQuestion({ template: "COMPETITION_SEASON", leagueId: UCL, season: 2019 }, factPack()),
    ).toBe("YES");
  });
  it("SEASON: NO only for a season with fully-resolved league data", () => {
    expect(
      answerQuestion({ template: "COMPETITION_SEASON", leagueId: UCL, season: 2016 }, factPack()),
    ).toBe("NO");
  });
  it("SEASON: UNKNOWN when that season had an unresolved (null-league) line", () => {
    const f = factPack({
      // 2016 no longer fully resolved — a null-league line existed that year.
      seasonsWithCompleteCompetitionData: [2015, 2017, 2018, 2019, 2020, 2021],
    });
    expect(
      answerQuestion({ template: "COMPETITION_SEASON", leagueId: UCL, season: 2016 }, f),
    ).toBe("UNKNOWN");
  });
  it("SEASON: UNKNOWN outside the covered career span", () => {
    expect(
      answerQuestion({ template: "COMPETITION_SEASON", leagueId: PL, season: 2005 }, factPack()),
    ).toBe("UNKNOWN");
  });
});

describe("TROPHY_EVER / TROPHY_SEASON", () => {
  it("EVER: YES for a won trophy, NO for a never-won one", () => {
    expect(answerQuestion({ template: "TROPHY_EVER", trophy: UCL_TROPHY }, factPack())).toBe("YES");
    expect(
      answerQuestion({ template: "TROPHY_EVER", trophy: PREMIER_LEAGUE_TROPHY }, factPack()),
    ).toBe("NO");
  });
  it("EVER: UNKNOWN instead of NO when the trophy import is not confirmed", () => {
    const f = factPack({ trophies: [], trophiesImported: false });
    expect(answerQuestion({ template: "TROPHY_EVER", trophy: UCL_TROPHY }, f)).toBe("UNKNOWN");
  });
  it("SEASON: YES on the dated win", () => {
    expect(
      answerQuestion({ template: "TROPHY_SEASON", trophy: UCL_TROPHY, season: 2018 }, factPack()),
    ).toBe("YES");
  });
  it("SEASON: NO for another season when every win of that trophy is dated", () => {
    expect(
      answerQuestion({ template: "TROPHY_SEASON", trophy: UCL_TROPHY, season: 2020 }, factPack()),
    ).toBe("NO");
  });
  it("SEASON: UNKNOWN when an undated win of that trophy exists", () => {
    expect(
      answerQuestion({ template: "TROPHY_SEASON", trophy: FA_CUP, season: 2020 }, factPack()),
    ).toBe("UNKNOWN");
  });
});

describe("TROPHY_WITH_CLUB", () => {
  it("YES when the winning season maps to exactly one club", () => {
    // UCL 2018: only Liverpool that season.
    expect(
      answerQuestion(
        { template: "TROPHY_WITH_CLUB", trophy: UCL_TROPHY, clubId: LIVERPOOL },
        factPack(),
      ),
    ).toBe("YES");
  });
  it("NO for a club the player never played for, regardless of trophy data", () => {
    const f = factPack({ trophiesImported: false });
    expect(
      answerQuestion({ template: "TROPHY_WITH_CLUB", trophy: UCL_TROPHY, clubId: REAL_MADRID }, f),
    ).toBe("NO");
  });
  it("NO when every win resolves to a different club", () => {
    expect(
      answerQuestion(
        { template: "TROPHY_WITH_CLUB", trophy: UCL_TROPHY, clubId: AJAX },
        factPack(),
      ),
    ).toBe("NO");
  });
  it("mid-season transfer (two clubs that season) is UNKNOWN without narrowing", () => {
    const f = factPack({
      trophies: [{ compName: "Premier League", country: "England", season: 2019 }],
    });
    // 2019 = Liverpool + Everton, and PREMIER_LEAGUE_TROPHY carries no leagueIds.
    expect(
      answerQuestion(
        { template: "TROPHY_WITH_CLUB", trophy: PREMIER_LEAGUE_TROPHY, clubId: LIVERPOOL },
        f,
      ),
    ).toBe("UNKNOWN");
  });
  it("league narrowing resolves ambiguity only to a UNIQUE competition club", () => {
    const f = factPack({
      trophies: [{ compName: "UEFA Champions League", country: "World", season: 2019 }],
    });
    // 2019: clubs Liverpool + Everton, but only Liverpool has a UCL line.
    expect(
      answerQuestion(
        {
          template: "TROPHY_WITH_CLUB",
          trophy: { ...UCL_TROPHY, leagueIds: [2] },
          clubId: LIVERPOOL,
        },
        f,
      ),
    ).toBe("YES");
    // Both candidates in the competition → must stay UNKNOWN.
    const f2 = factPack({
      trophies: [{ compName: "Premier League", country: "England", season: 2019 }],
    });
    expect(
      answerQuestion(
        {
          template: "TROPHY_WITH_CLUB",
          trophy: { ...PREMIER_LEAGUE_TROPHY, leagueIds: [39] },
          clubId: LIVERPOOL,
        },
        f2,
      ),
    ).toBe("UNKNOWN");
  });
  it("undated win keeps the negative UNKNOWN (never a guessed NO)", () => {
    // FA Cup win is undated; asked with Ajax (a career club that never
    // resolves as the winner) → UNKNOWN, not NO.
    expect(
      answerQuestion({ template: "TROPHY_WITH_CLUB", trophy: FA_CUP, clubId: AJAX }, factPack()),
    ).toBe("UNKNOWN");
  });
});

describe("competition identity aliases (same real competition, variant league ids)", () => {
  it("appearing under an ALT league id counts", () => {
    const f = factPack(); // plays league 39 + 2 + 88
    expect(
      answerQuestion({ template: "COMPETITION_EVER", leagueId: 999, altLeagueIds: [39] }, f),
    ).toBe("YES");
    expect(
      answerQuestion(
        { template: "COMPETITION_SEASON", leagueId: 999, altLeagueIds: [39], season: 2019 },
        f,
      ),
    ).toBe("YES");
    // without the alias the variant id would wrongly answer NO
    expect(answerQuestion({ template: "COMPETITION_EVER", leagueId: 999 }, f)).toBe("NO");
  });
  it("aliases never create appearances that don't exist", () => {
    const f = factPack();
    expect(
      answerQuestion({ template: "COMPETITION_EVER", leagueId: 999, altLeagueIds: [998] }, f),
    ).toBe("NO");
  });
});

describe("trophy identity aliases (same real trophy, variant source strings)", () => {
  it("a win recorded under an ALT identity counts (the World Cup split)", () => {
    const f = factPack({
      trophies: [{ compName: "World Cup", country: "World", season: 2022 }],
    });
    const fifa = {
      compName: "FIFA World Cup",
      country: "World",
      altKeys: [{ compName: "World Cup", country: "World" }],
    };
    expect(answerQuestion({ template: "TROPHY_EVER", trophy: fifa }, f)).toBe("YES");
    expect(answerQuestion({ template: "TROPHY_SEASON", trophy: fifa, season: 2022 }, f)).toBe("YES");
    // Without the alias the split would have produced the wrong NO:
    expect(
      answerQuestion(
        { template: "TROPHY_EVER", trophy: { compName: "FIFA World Cup", country: "World" } },
        f,
      ),
    ).toBe("NO");
  });
  it("aliases never create matches that don't exist", () => {
    const f = factPack({ trophies: [] });
    const fifa = {
      compName: "FIFA World Cup",
      country: "World",
      altKeys: [{ compName: "World Cup", country: "World" }],
    };
    expect(answerQuestion({ template: "TROPHY_EVER", trophy: fifa }, f)).toBe("NO");
  });
});

describe("forbidden topics are structurally unaskable", () => {
  it("the FactPack carries no position/physique fields", () => {
    const keys = Object.keys(factPack()).map((k) => k.toLowerCase());
    for (const banned of ["position", "height", "weight", "photo", "birth"]) {
      expect(keys.some((k) => k.includes(banned))).toBe(false);
    }
  });
});
