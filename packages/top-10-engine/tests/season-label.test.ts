import { describe, it, expect } from "vitest";
import {
  TT_COMPETITIONS,
  TT_SINGLE_YEAR_LEAGUE_IDS,
  TT_TOP5_LEAGUE_IDS,
  TT_UCL_LEAGUE_ID,
  ttSeasonLabel,
} from "@fb/shared";

/**
 * CONTRACT PIN for the contestant-facing season label. The stored `season` integer is
 * the season's START year (verified against source data: PL 2019 → Vardy's 2019/20
 * Golden Boot; WC 2022 → Mbappé). Cross-calendar competitions must render the real
 * two-year span; single-year tournaments (WC/Euro/Copa) must stay one year. A wrong
 * label is a 0%-error violation, so these are pinned.
 */
describe("ttSeasonLabel — season display mapping", () => {
  it("cross-calendar leagues render the short two-year span (start/end-2-digit)", () => {
    expect(ttSeasonLabel(2019, 2019, 39)).toBe("2019/20"); // Premier League
    expect(ttSeasonLabel(2020, 2020, 140)).toBe("2020/21"); // La Liga
    expect(ttSeasonLabel(2011, 2011, 78)).toBe("2011/12"); // Bundesliga
    expect(ttSeasonLabel(2009, 2009, 39)).toBe("2009/10"); // zero-padded end year
  });

  it("the Champions League is cross-calendar", () => {
    expect(ttSeasonLabel(2019, 2019, TT_UCL_LEAGUE_ID)).toBe("2019/20");
  });

  it("the Top-5 grouped scope (stored leagueId 0) is cross-calendar", () => {
    expect(ttSeasonLabel(2020, 2020, 0)).toBe("2020/21");
  });

  it("single-year tournaments stay one year (no false two-year span)", () => {
    expect(ttSeasonLabel(2018, 2018, 1)).toBe("2018"); // World Cup
    expect(ttSeasonLabel(2020, 2020, 4)).toBe("2020"); // Euro
    expect(ttSeasonLabel(2019, 2019, 9)).toBe("2019"); // Copa América
  });

  it("multi-season windows read as an explicit Arabic from→to range", () => {
    expect(ttSeasonLabel(2018, 2020, 39)).toBe("من 2018/19 إلى 2020/21"); // 3-season PL
    expect(ttSeasonLabel(2014, 2018, 1)).toBe("من 2014 إلى 2018"); // single-year tournament range
  });

  it("the single-year set is exactly WC/Euro/Copa, and they are real whitelisted comps", () => {
    expect([...TT_SINGLE_YEAR_LEAGUE_IDS].sort((a, b) => a - b)).toEqual([1, 4, 9]);
    // none of the cross-calendar (Top-5 + UCL) ids may leak into the single-year set
    for (const id of [...TT_TOP5_LEAGUE_IDS, TT_UCL_LEAGUE_ID]) {
      expect(TT_SINGLE_YEAR_LEAGUE_IDS).not.toContain(id);
    }
    // every single-year id is a known competition
    for (const id of TT_SINGLE_YEAR_LEAGUE_IDS) {
      expect(TT_COMPETITIONS.some((c) => c.leagueId === id)).toBe(true);
    }
  });
});
