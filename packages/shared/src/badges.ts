import { z } from "zod";

/**
 * Statistics & progression — shared contracts (Layers 3 & 4). The badge engine
 * is data-driven, exactly like the hand-rank catalog: each badge is a rule
 * (jsonb in the `badges` table) evaluated against a player's derived metrics.
 * Adding a badge = inserting a row; no code change. Nothing here is football
 * data — only progression rules.
 */

// --- play event types (mirror the Prisma enum) ------------------------------
export const PLAY_EVENT_TYPES = [
  "BET",
  "RAISE",
  "CALL",
  "CHECK",
  "FOLD",
  "ALLIN",
  "ROUND_SUMMARY",
] as const;
export type PlayEventType = (typeof PLAY_EVENT_TYPES)[number];

/** A "strong bet" for bluff detection: wager ≥ this fraction of the pot. */
export const BLUFF_BET_TO_POT = 0.75;
/** A "weak" final hand: rank strength at or below this (PAIR=1, TWO_PAIR=2). */
export const WEAK_RANK_MAX_STRENGTH = 2;

// --- badge rule DSL ---------------------------------------------------------
export const METRIC_OPS = [">=", ">", "<=", "<", "=="] as const;
export type MetricOp = (typeof METRIC_OPS)[number];

/** One comparison against a derived metric field (see MetricView keys). */
export interface MetricCondition {
  metric: string;
  op: MetricOp;
  value: number;
}

/** A badge condition: ALL must hold (and optionally ANY of a second set). */
export interface BadgeRule {
  all?: MetricCondition[];
  any?: MetricCondition[];
}

export const badgeRuleSchema: z.ZodType<BadgeRule> = z.object({
  all: z
    .array(
      z.object({
        metric: z.string(),
        op: z.enum(METRIC_OPS),
        value: z.number(),
      }),
    )
    .optional(),
  any: z
    .array(
      z.object({ metric: z.string(), op: z.enum(METRIC_OPS), value: z.number() }),
    )
    .optional(),
});

export function parseBadgeRule(raw: unknown): BadgeRule {
  return badgeRuleSchema.parse(raw);
}

/**
 * The flat, derived view a badge rule evaluates against. Rates are computed
 * from the raw PlayerMetrics counters so rules read clean fields. luck_index is
 * the mean per-round (dealt strength − round average), in roughly [-1, 1].
 */
export interface MetricView {
  matches: number;
  wins: number;
  losses: number;
  folds: number;
  net_profit: number;
  win_rate: number;
  fold_rate: number;
  showdown_rate: number;
  win_rate_when_played: number;
  bluff_count: number;
  bluff_rate: number;
  bluff_success_rate: number;
  avg_bet_to_pot: number;
  luck_index: number;
  weak_won_count: number;
  biggest_pot: number;
  longest_win_streak: number;
}

/** Raw counters as stored in PlayerMetrics (numbers; BigInts pre-converted). */
export interface MetricCounters {
  matches: number;
  wins: number;
  losses: number;
  folds: number;
  netProfit: number;
  showdownCount: number;
  bluffCount: number;
  bluffSuccessCount: number;
  weakWonCount: number;
  betToPotSum: number;
  betActionCount: number;
  luckSum: number;
  luckRounds: number;
  biggestPot: number;
  longestWinStreak: number;
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Compute the derived MetricView from raw counters (no rounding; for rules). */
export function deriveMetricView(c: MetricCounters): MetricView {
  const played = c.matches - c.folds; // matches the player did not fold
  return {
    matches: c.matches,
    wins: c.wins,
    losses: c.losses,
    folds: c.folds,
    net_profit: c.netProfit,
    win_rate: div(c.wins, c.matches),
    fold_rate: div(c.folds, c.matches),
    showdown_rate: div(c.showdownCount, c.matches),
    win_rate_when_played: div(c.wins, played),
    bluff_count: c.bluffCount,
    bluff_rate: div(c.bluffCount, c.matches),
    bluff_success_rate: div(c.bluffSuccessCount, c.bluffCount),
    avg_bet_to_pot: div(c.betToPotSum, c.betActionCount),
    luck_index: div(c.luckSum, c.luckRounds),
    weak_won_count: c.weakWonCount,
    biggest_pot: c.biggestPot,
    longest_win_streak: c.longestWinStreak,
  };
}

function cmp(actual: number, op: MetricOp, value: number): boolean {
  switch (op) {
    case ">=":
      return actual >= value;
    case ">":
      return actual > value;
    case "<=":
      return actual <= value;
    case "<":
      return actual < value;
    case "==":
      return actual === value;
  }
}

/** Pure: does this player's metric view satisfy the badge rule? */
export function evaluateBadgeRule(rule: BadgeRule, view: MetricView): boolean {
  const lookup = (m: string) => (view as unknown as Record<string, number>)[m] ?? 0;
  const allOk = (rule.all ?? []).every((c) => cmp(lookup(c.metric), c.op, c.value));
  const anyOk = !rule.any || rule.any.length === 0
    ? true
    : rule.any.some((c) => cmp(lookup(c.metric), c.op, c.value));
  return allOk && anyOk;
}

// --- seed catalog (Layer 3) -------------------------------------------------
export interface BadgeDefinition {
  code: string;
  nameAr: string;
  descriptionAr: string;
  icon: string;
  sortOrder: number;
  rule: BadgeRule;
}

/** The seeded badges. Conditions are gated by a minimum number of matches so a
 *  badge can't trigger on a tiny, noisy sample. Edit/extend by adding rows. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  {
    code: "BLUFFER",
    nameAr: "المخادع",
    descriptionAr: "يفوز بالمراهنة بقوة على أوراق ضعيفة. يُمنح عند نجاح نصف خدعاته أو أكثر (٥ خدعات فأكثر).",
    icon: "🎭",
    sortOrder: 1,
    rule: { all: [{ metric: "bluff_success_rate", op: ">=", value: 0.5 }, { metric: "bluff_count", op: ">=", value: 5 }] },
  },
  {
    code: "LUCKY",
    nameAr: "المحظوظ",
    descriptionAr: "تُوزَّع له أوراق أقوى من المتوسط باستمرار. يُمنح عند مؤشر حظ مرتفع خلال ٢٠ مباراة فأكثر.",
    icon: "🍀",
    sortOrder: 2,
    rule: { all: [{ metric: "luck_index", op: ">=", value: 0.1 }, { metric: "matches", op: ">=", value: 20 }] },
  },
  {
    code: "ROCK",
    nameAr: "الصخرة",
    descriptionAr: "ينسحب كثيرًا لكنه يفوز عندما يلعب. يُمنح عند نسبة انسحاب عالية مع نسبة فوز عالية عند اللعب (٢٠ مباراة فأكثر).",
    icon: "🪨",
    sortOrder: 3,
    rule: {
      all: [
        { metric: "fold_rate", op: ">=", value: 0.5 },
        { metric: "win_rate_when_played", op: ">=", value: 0.5 },
        { metric: "matches", op: ">=", value: 20 },
      ],
    },
  },
  {
    code: "GAMBLER",
    nameAr: "المقامر",
    descriptionAr: "يراهن بمبالغ كبيرة نسبةً إلى المجمّع. يُمنح عند متوسط رهان مرتفع جدًا مقابل المجمّع (١٥ مباراة فأكثر).",
    icon: "🎲",
    sortOrder: 4,
    rule: { all: [{ metric: "avg_bet_to_pot", op: ">=", value: 0.8 }, { metric: "matches", op: ">=", value: 15 }] },
  },
  {
    code: "FOX",
    nameAr: "الثعلب",
    descriptionAr: "يفوز بأوراق ضعيفة مرارًا. يُمنح عند الفوز بترابط ضعيف ٥ مرات فأكثر.",
    icon: "🦊",
    sortOrder: 5,
    rule: { all: [{ metric: "weak_won_count", op: ">=", value: 5 }] },
  },
];

// --- Layer 4: composite XP / level ------------------------------------------
/**
 * Composite XP: weighted contributions from skill (wins), results (profit),
 * progression (badges) and activity (matches) — so level reflects skill, not
 * just play volume.
 */
export function computeXp(view: MetricView, badgesUnlocked: number): number {
  return Math.max(
    0,
    Math.round(
      10 * view.wins + 0.02 * Math.max(0, view.net_profit) + 50 * badgesUnlocked + 1 * view.matches,
    ),
  );
}

/** Smooth curve: each level needs progressively more XP. Level 1 at xp 0. */
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}
