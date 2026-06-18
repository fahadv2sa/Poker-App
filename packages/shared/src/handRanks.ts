import { z } from "zod";
import { HAND_SIZE } from "./constants.js";
import type { HandRankCode } from "./enums.js";

/**
 * Rule DSL (Section 7.3) and the canonical catalog of the 9 hand ranks
 * (Section 7.2 / 7.4). This module is the single source of truth for the
 * association rules: the seed (packages/db) writes this catalog into the
 * HandRanks table, and the engine (packages/engine) interprets the same DSL at
 * runtime. Nothing here is football data — only game rules.
 *
 * The value HAND_SIZE (Section 19.1) is referenced for the Royals and
 * Full-House-Club rather than hardcoded as a literal.
 */

export type RuleAttribute = "nationality" | "position" | "club";

/** Cards share a value. single-valued ⇒ same value; club ⇒ ≥1 shared club. */
export interface GroupRule {
  type: "group";
  attribute: RuleAttribute;
  min: number;
  /** club only: "identical" = full club-set match. Default "shared". */
  match?: "shared" | "identical";
}

/** Every position (GK/DEF/MID/FWD) is covered by at least one card. */
export interface CoverageRule {
  type: "coverage";
  attribute: "position";
  values: "all";
}

/** OR — at least one sub-rule holds. */
export interface AnyOfRule {
  type: "anyOf";
  rules: Rule[];
}

/** AND — all sub-rules hold; disjoint=true ⇒ each on its own cards. */
export interface AllOfRule {
  type: "allOf";
  disjoint?: boolean;
  rules: Rule[];
}

export type Rule = GroupRule | CoverageRule | AnyOfRule | AllOfRule;

/**
 * Zod schema for the Rule DSL. Used to parse the untyped `rule` jsonb coming
 * from the HandRanks table so the engine operates on validated, typed rules.
 */
export const ruleSchema: z.ZodType<Rule> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("group"),
      attribute: z.enum(["nationality", "position", "club"]),
      min: z.number().int().positive(),
      match: z.enum(["shared", "identical"]).optional(),
    }),
    z.object({
      type: z.literal("coverage"),
      attribute: z.literal("position"),
      values: z.literal("all"),
    }),
    z.object({
      type: z.literal("anyOf"),
      rules: z.array(ruleSchema).min(1),
    }),
    z.object({
      type: z.literal("allOf"),
      disjoint: z.boolean().optional(),
      rules: z.array(ruleSchema).min(1),
    }),
  ]),
);

export interface HandRankDefinition {
  code: HandRankCode;
  nameAr: string;
  nameEn: string;
  strength: number;
  rule: Rule;
  descriptionAr: string;
  examples: string[];
}

// A single "pair-like" group: same nationality, position, or shared club.
const pairAnyOf: AnyOfRule = {
  type: "anyOf",
  rules: [
    { type: "group", attribute: "nationality", min: 2 },
    { type: "group", attribute: "position", min: 2 },
    { type: "group", attribute: "club", min: 2 },
  ],
};

// A single "triple-like" group: three cards sharing a nationality, a position,
// or at least one career club. Used by TRIPLE and by each half of FULL_HOUSE.
const tripleAnyOf: AnyOfRule = {
  type: "anyOf",
  rules: [
    { type: "group", attribute: "nationality", min: 3 },
    { type: "group", attribute: "position", min: 3 },
    { type: "group", attribute: "club", min: 3 },
  ],
};

/**
 * The 9 official hand ranks, strongest (9) to weakest (1). Seeded into
 * HandRanks and interpreted by the engine. Editing a rule here (and re-seeding)
 * changes game behavior without touching engine code.
 */
export const HAND_RANK_CATALOG: readonly HandRankDefinition[] = [
  {
    code: "ROYAL_CLUB",
    nameAr: "رويال النادي",
    nameEn: "Club Royal",
    strength: 9,
    rule: { type: "group", attribute: "club", min: HAND_SIZE, match: "identical" },
    descriptionAr: `${HAND_SIZE} بطاقات بمجموعة أندية متطابقة تمامًا.`,
    examples: ["خمسة لاعبين يشتركون في نفس مجموعة الأندية بالكامل"],
  },
  {
    code: "ROYAL_NATION",
    nameAr: "رويال الجنسية",
    nameEn: "Nation Royal",
    strength: 8,
    rule: { type: "group", attribute: "nationality", min: HAND_SIZE },
    descriptionAr: `${HAND_SIZE} بطاقات بنفس الجنسية.`,
    examples: ["خمسة لاعبين بنفس الجنسية"],
  },
  {
    code: "ROYAL_POSITION",
    nameAr: "رويال المراكز",
    nameEn: "Position Royal",
    strength: 7,
    rule: { type: "group", attribute: "position", min: HAND_SIZE },
    descriptionAr: `${HAND_SIZE} بطاقات بنفس المركز.`,
    examples: ["خمسة لاعبين بنفس المركز"],
  },
  {
    code: "FULL_HOUSE",
    nameAr: "فل هاوس",
    nameEn: "Full House",
    strength: 6,
    // A group of 3 (sharing a club, position, or nationality) plus a DISJOINT
    // group of 2 (likewise), with no shared cards between the two groups.
    rule: { type: "allOf", disjoint: true, rules: [tripleAnyOf, pairAnyOf] },
    descriptionAr:
      "ثلاثة لاعبين يجمعهم نادٍ مشترك أو مركز واحد أو جنسية واحدة، بالإضافة إلى لاعبَين آخرَين يجمعهما نادٍ مشترك أو مركز واحد أو جنسية واحدة. المجموعتان منفصلتان تماماً.",
    examples: ["ثلاثة مدافعين + برازيليان", "ثلاثة برازيليين + مهاجمان"],
  },
  {
    code: "FULL_HOUSE_CLUB",
    nameAr: "فل هاوس كلوب",
    nameEn: "Club Full House",
    strength: 5,
    rule: { type: "group", attribute: "club", min: HAND_SIZE },
    descriptionAr: `${HAND_SIZE} بطاقات تشترك في نادٍ واحد على الأقل.`,
    examples: ["خمسة لاعبين مرّوا جميعًا بنادٍ واحد مشترك"],
  },
  {
    code: "LINEUP",
    nameAr: "تشكيلة",
    nameEn: "Lineup",
    strength: 4,
    rule: { type: "coverage", attribute: "position", values: "all" },
    descriptionAr: "تغطية كل المراكز الأربعة: GK وDEF وMID وFWD.",
    examples: ["حارس + مدافع + وسط + مهاجم"],
  },
  {
    code: "TRIPLE",
    nameAr: "ثلاثي",
    nameEn: "Triple",
    strength: 3,
    // Three cards sharing a club, a position, or a nationality.
    rule: tripleAnyOf,
    descriptionAr:
      "ثلاثة لاعبين يجمعهم نادٍ مشترك في مسيرتهم الاحترافية، أو مركز واحد، أو جنسية واحدة.",
    examples: ["ثلاثة إيطاليين", "ثلاثة لاعبي وسط"],
  },
  {
    code: "TWO_PAIR",
    nameAr: "زوجين",
    nameEn: "Two Pair",
    strength: 2,
    rule: { type: "allOf", disjoint: true, rules: [pairAnyOf, pairAnyOf] },
    descriptionAr: "زوجان منفصلان، كل زوج بجنسية أو مركز أو نادٍ مشترك واحد.",
    examples: ["زوج إسباني + زوج حُرّاس"],
  },
  {
    code: "PAIR",
    nameAr: "زوج",
    nameEn: "Pair",
    strength: 1,
    rule: pairAnyOf,
    descriptionAr: "زوج واحد بجنسية أو مركز أو نادٍ مشترك واحد.",
    examples: ["مهاجمان", "أرجنتينيان", "زميلان في النادي"],
  },
];
