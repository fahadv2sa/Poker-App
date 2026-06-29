import type { TtStateView } from "@fb/shared";

type QType = NonNullable<TtStateView["question"]>["type"];

/**
 * Per-question-type glyph + Arabic unit shown on the value badge. The glyph silently
 * teaches WHAT the list ranks (goals / saves / dribbles …) — onboarding through a tool,
 * not a wall of text. Kept tiny + emoji-based for now; can become SVG later.
 */
export const TT_METRIC: Record<string, { glyph: string; unitAr: string }> = {
  GOAL_SCORERS: { glyph: "⚽", unitAr: "هدف" },
  ASSISTS: { glyph: "👟", unitAr: "صناعة" },
  KEY_PASSES: { glyph: "🔑", unitAr: "تمريرة مفتاحية" },
  TACKLES: { glyph: "🛡️", unitAr: "تدخل" },
  ACCURATE_PASSES: { glyph: "✅", unitAr: "تمريرة دقيقة" },
  SHOTS_TOTAL: { glyph: "🎯", unitAr: "تسديدة" },
  SHOTS_ON: { glyph: "🥅", unitAr: "على المرمى" },
  DRIBBLES_SUCCESS: { glyph: "⚡", unitAr: "مراوغة ناجحة" },
  GK_SAVES: { glyph: "🧤", unitAr: "تصدٍّ" },
};

export function metricOf(type?: QType | string): { glyph: string; unitAr: string } {
  return (type && TT_METRIC[type]) || { glyph: "★", unitAr: "" };
}
