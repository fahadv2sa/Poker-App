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
  KEY_PASSES_ALL: {
    nameAr: "أكثر اللاعبين تمريراتٍ مفتاحية",
    nameEn: "Top players by key passes",
    position: null,
    metric: "SUM(passes_key) per competition-season",
    sanityMax: 400,
  },
  ACCURATE_PASSES_ALL: {
    nameAr: "أكثر اللاعبين تمريراتٍ دقيقة",
    nameEn: "Top players by accurate passes",
    position: null,
    metric: "SUM(passes_total × clamp(passes_accuracy,0,100)/100) per competition-season",
    sanityMax: 5000,
  },
  SHOTS_TOTAL: {
    nameAr: "أكثر اللاعبين تسديدًا",
    nameEn: "Top players by total shots",
    position: null,
    metric: "SUM(shots_total) per competition-season",
    sanityMax: 350,
  },
  SHOTS_ON: {
    nameAr: "أكثر اللاعبين تسديدًا على المرمى",
    nameEn: "Top players by shots on target",
    position: null,
    metric: "SUM(shots_on) per competition-season",
    sanityMax: 200,
  },
  DRIBBLES_SUCCESS: {
    nameAr: "أكثر اللاعبين مراوغةً ناجحة",
    nameEn: "Top players by successful dribbles",
    position: null,
    metric: "SUM(dribbles_success) per competition-season",
    sanityMax: 350,
  },
  GK_SAVES: {
    nameAr: "أكثر الحراس تصديًا",
    nameEn: "Top goalkeepers by saves",
    position: "GK",
    metric: "SUM(goals_saves) per competition-season, position=GK",
    sanityMax: 400,
  },
} as const;

/** Competition labels are also shown in every title — pin them too so a change (e.g.
 *  the Euro label) is a deliberate, reviewed edit. */
const COMP_PIN: Record<number, { nameAr: string; nameEn: string }> = {
  39: { nameAr: "الدوري الإنجليزي", nameEn: "Premier League" },
  140: { nameAr: "الدوري الإسباني", nameEn: "La Liga" },
  135: { nameAr: "الدوري الإيطالي", nameEn: "Serie A" },
  78: { nameAr: "الدوري الألماني", nameEn: "Bundesliga" },
  61: { nameAr: "الدوري الفرنسي", nameEn: "Ligue 1" },
  2: { nameAr: "دوري أبطال أوروبا", nameEn: "UEFA Champions League" },
  1: { nameAr: "كأس العالم", nameEn: "FIFA World Cup" },
  4: { nameAr: "بطولة أمم أوروبا", nameEn: "UEFA Euro" },
  9: { nameAr: "كوبا أمريكا", nameEn: "Copa América" },
};

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

  it("competition labels match the reviewed pin exactly", () => {
    const actual = Object.fromEntries(TT_COMPETITIONS.map((c) => [c.leagueId, { nameAr: c.nameAr, nameEn: c.nameEn }]));
    expect(actual).toStrictEqual(COMP_PIN);
  });
});
