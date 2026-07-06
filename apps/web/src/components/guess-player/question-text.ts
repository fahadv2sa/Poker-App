import type { GpQuestionView } from "@fb/shared";

/** Season display: API start-year int → "٢٠١٨/٢٠١٩"-style label (Latin digits,
 *  matching the platform's `num` convention). */
export function seasonLabel(season: number): string {
  return `${season}/${season + 1}`;
}

/** Render an answered question as the natural Arabic sentence the composer
 *  showed when it was asked (labels are frozen in `params`). */
export function questionTextAr(q: Pick<GpQuestionView, "template" | "params">): string {
  const p = q.params as Record<string, string | number>;
  switch (q.template) {
    case "CLUB_EVER":
      return `هل لعب في نادي ${p.clubName}؟`;
    case "CLUB_SEASON":
      return `هل لعب في نادي ${p.clubName} موسم ${seasonLabel(Number(p.season))}؟`;
    case "NATIONALITY":
      return `هل جنسيته ${p.countryName}؟`;
    case "NATIONAL_TEAM":
      return `هل لعب لمنتخب ${p.countryName}؟`;
    case "COMPETITION_EVER":
      return `هل لعب في ${p.competitionName}؟`;
    case "COMPETITION_SEASON":
      return `هل لعب في ${p.competitionName} موسم ${seasonLabel(Number(p.season))}؟`;
    case "TROPHY_EVER":
      return `هل فاز بلقب ${p.trophyName}؟`;
    case "TROPHY_SEASON":
      return `هل فاز بلقب ${p.trophyName} موسم ${seasonLabel(Number(p.season))}؟`;
    case "TROPHY_WITH_CLUB":
      return `هل فاز بلقب ${p.trophyName} مع نادي ${p.clubName}؟`;
  }
}

export const ANSWER_AR = {
  YES: { text: "نعم", cls: "text-[var(--lu-gold-1)] ring-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10" },
  NO: { text: "لا", cls: "text-[var(--fb-danger)] ring-[var(--fb-danger)]/40 bg-[var(--fb-danger)]/10" },
  UNKNOWN: { text: "لا يمكن الإجابة", cls: "text-[var(--lu-tan)] ring-white/20 bg-white/5" },
} as const;

// ---- compact board chips (final ruling: no sentences on the board) ---------

/** The 4 composer categories — the board groups answers under the SAME ids. */
export type GpBoardCategory = "clubs" | "identity" | "competitions" | "trophies";

export const BOARD_CATEGORIES: ReadonlyArray<{ id: GpBoardCategory; icon: string; label: string }> = [
  { id: "clubs", icon: "🏟️", label: "الأندية" },
  { id: "identity", icon: "🌍", label: "الجنسية والمنتخب" },
  { id: "competitions", icon: "🏆", label: "البطولات" },
  { id: "trophies", icon: "🥇", label: "الألقاب" },
];

export function categoryOf(template: GpQuestionView["template"]): GpBoardCategory {
  switch (template) {
    case "CLUB_EVER":
    case "CLUB_SEASON":
      return "clubs";
    case "NATIONALITY":
    case "NATIONAL_TEAM":
      return "identity";
    case "COMPETITION_EVER":
    case "COMPETITION_SEASON":
      return "competitions";
    case "TROPHY_EVER":
    case "TROPHY_SEASON":
    case "TROPHY_WITH_CLUB":
      return "trophies";
  }
}

/** ONE compact chip label per answered question — exact approved format
 *  (entity [+ season start-year], NO sentence). The ✓/✗/؟ mark is rendered
 *  separately by the chip. */
export function chipTextAr(q: Pick<GpQuestionView, "template" | "params">): string {
  const p = q.params as Record<string, string | number>;
  switch (q.template) {
    case "CLUB_EVER":
      return String(p.clubName);
    case "CLUB_SEASON":
      return `${p.clubName} ${p.season}`;
    case "NATIONALITY":
      return String(p.countryName);
    case "NATIONAL_TEAM":
      return `منتخب ${p.countryName}`;
    case "COMPETITION_EVER":
      return String(p.competitionName);
    case "COMPETITION_SEASON":
      return `${p.competitionName} ${p.season}`;
    case "TROPHY_EVER":
      return String(p.trophyName);
    case "TROPHY_SEASON":
      return `${p.trophyName} ${p.season}`;
    case "TROPHY_WITH_CLUB":
      return `${p.trophyName} مع ${p.clubName}`;
  }
}

/** Chip answer mark: ✓ = YES, ✗ = NO, ؟ = «لا يمكن الإجابة» (distinct state). */
export const CHIP_MARK = {
  YES: { mark: "✓", cls: "text-[var(--lu-gold-1)] ring-[var(--lu-gold-1)]/40 bg-[var(--lu-gold-2)]/10" },
  NO: { mark: "✗", cls: "text-[var(--fb-danger)] ring-[var(--fb-danger)]/40 bg-[var(--fb-danger)]/10" },
  UNKNOWN: { mark: "؟", cls: "text-[var(--lu-tan)] ring-white/25 bg-white/[0.06]" },
} as const;
