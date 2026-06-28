import { describe, it, expect } from "vitest";
import { TT_ACTIVE_QUESTION_TYPES, TT_COMPETITIONS, TT_TYPE_META } from "@fb/shared";

/**
 * CONTRACT PIN for the question metadata shown to contestants. Arabic labels can't be
 * machine-verified for meaning, so this freezes the REVIEWED mapping of label ↔ metric
 * ↔ scope ↔ bound. Any change to a stat label, source metric, position scope, or sanity
 * ceiling fails here — forcing a deliberate review that the Arabic still matches what the
 * query computes (this is the guard against the class of bug that once displayed
 * KEY_PASSES as "assists" / تمريرات حاسمة). Update the pin ONLY after verifying the Arabic.
 */
const PIN = {
  GOAL_SCORERS: {
    nameAr: "أكثر اللاعبين تسجيلاً للأهداف",
    nameEn: "Top goal scorers",
    position: null,
    metric: "SUM(goals_total) per competition-season",
    sanityMax: 80,
  },
  ASSISTS: {
    nameAr: "أكثر اللاعبين صناعةً للأهداف",
    nameEn: "Top assist providers",
    position: null,
    metric: "SUM(goals_assists) per competition-season",
    sanityMax: 60,
  },
  KEY_PASSES: {
    nameAr: "أكثر لاعبي الوسط تمريراتٍ مفتاحية",
    nameEn: "Top midfielders by key passes",
    position: "MID",
    metric: "SUM(passes_key) per competition-season, position=MID",
    sanityMax: 400,
  },
  TACKLES: {
    nameAr: "أكثر المدافعين تدخلات",
    nameEn: "Top defenders by tackles",
    position: "DEF",
    metric: "SUM(tackles_total) per competition-season, position=DEF",
    sanityMax: 400,
  },
  ACCURATE_PASSES: {
    nameAr: "أكثر لاعبي الوسط تمريراتٍ دقيقة",
    nameEn: "Top midfielders by accurate passes",
    position: "MID",
    metric: "SUM(passes_total × clamp(passes_accuracy,0,100)/100) per competition-season, position=MID",
    sanityMax: 5000,
  },
  GK_CLEAN_SHEETS: {
    nameAr: "أكثر الحراس نظافةً لشباكهم",
    nameEn: "Top goalkeepers by clean sheets",
    position: "GK",
    metric: "(dormant — no clean-sheets column yet)",
    sanityMax: 40,
  },
} as const;

describe("TT_TYPE_META contract (label ↔ metric ↔ scope ↔ bound)", () => {
  it("matches the reviewed pin exactly", () => {
    expect(TT_TYPE_META).toStrictEqual(PIN);
  });

  it("every active type has a non-empty Arabic label, English meaning, metric, and positive bound", () => {
    for (const t of TT_ACTIVE_QUESTION_TYPES) {
      const m = TT_TYPE_META[t];
      expect(m.nameAr.trim().length).toBeGreaterThan(0);
      expect(m.nameEn.trim().length).toBeGreaterThan(0);
      expect(m.metric.trim().length).toBeGreaterThan(0);
      expect(m.sanityMax).toBeGreaterThan(0);
    }
  });

  it("every competition has a non-empty Arabic + English name and a numeric league id", () => {
    for (const c of TT_COMPETITIONS) {
      expect(c.nameAr.trim().length).toBeGreaterThan(0);
      expect(c.nameEn.trim().length).toBeGreaterThan(0);
      expect(Number.isInteger(c.leagueId)).toBe(true);
    }
  });
});
