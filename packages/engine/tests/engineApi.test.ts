import { describe, expect, it } from "vitest";
import {
  HAND_RANK_CATALOG,
  achievableRanks,
  bestAchievableRank,
  evaluateRank,
  parseRule,
  resolveByStrength,
  validateClaim,
} from "../src/index.js";
import { card, RANKS } from "./helpers.js";

/**
 * Tests for the public engine API (Section 7.5) and the winner-resolution
 * rules (Section 11): achievableRanks, bestAchievableRank, validateClaim,
 * resolveByStrength, plus parseRule (the DSL gate for DB-sourced rules).
 */

// A "stacked" pool: five goalkeepers, all Brazilian, all with the identical
// club set {RM}. It satisfies everything except LINEUP (only one position).
const STACKED = [
  card("BR", "GK", ["RM"]),
  card("BR", "GK", ["RM"]),
  card("BR", "GK", ["RM"]),
  card("BR", "GK", ["RM"]),
  card("BR", "GK", ["RM"]),
];

describe("achievableRanks", () => {
  it("returns every satisfied rank, strongest first", () => {
    const got = achievableRanks(STACKED, RANKS).map((r) => r.code);
    expect(got).toEqual([
      "ROYAL_CLUB",
      "ROYAL_NATION",
      "ROYAL_POSITION",
      "FULL_HOUSE_CLUB",
      "FULL_HOUSE",
      "TRIPLE",
      "TWO_PAIR",
      "PAIR",
    ]);
    expect(got).not.toContain("LINEUP");
  });

  it("returns an empty list when nothing is satisfied", () => {
    const lonely = [card("BR", "GK", ["RM"])];
    expect(achievableRanks(lonely, RANKS)).toEqual([]);
  });
});

describe("bestAchievableRank", () => {
  it("picks the single strongest achievable rank", () => {
    expect(bestAchievableRank(STACKED, RANKS)?.code).toBe("ROYAL_CLUB");
  });

  it("is null when no rank is achievable", () => {
    expect(bestAchievableRank([card("BR", "GK")], RANKS)).toBeNull();
  });
});

describe("validateClaim", () => {
  it("accepts a true claim and still reports the best possible", () => {
    const res = validateClaim(STACKED, "PAIR", RANKS);
    expect(res.isValid).toBe(true);
    expect(res.bestPossibleRankId).toBe("ROYAL_CLUB");
  });

  it("rejects a claim the pool does not achieve (LINEUP on one position)", () => {
    const res = validateClaim(STACKED, "LINEUP", RANKS);
    expect(res.isValid).toBe(false);
    expect(res.bestPossibleRankId).toBe("ROYAL_CLUB");
  });

  it("rejects a wrong claim even when a higher rank is available (Section 11)", () => {
    // Five same-nationality cards with DIFFERENT club sets: ROYAL_NATION holds,
    // but a ROYAL_CLUB claim is false.
    const pool = [
      card("BR", "GK", ["A"]),
      card("BR", "DEF", ["B"]),
      card("BR", "MID", ["C"]),
      card("BR", "FWD", ["D"]),
      card("BR", "MID", ["E"]),
    ];
    const res = validateClaim(pool, "ROYAL_CLUB", RANKS);
    expect(res.isValid).toBe(false);
    expect(res.bestPossibleRankId).toBe("ROYAL_NATION");
  });

  it("throws on an unknown rank id (server-controlled, so a bug)", () => {
    expect(() => validateClaim(STACKED, "NOPE", RANKS)).toThrow(/Unknown hand rank/);
  });
});

describe("resolveByStrength", () => {
  it("picks the single highest strength as the lone winner", () => {
    const res = resolveByStrength([
      { ref: "a", strength: 9 },
      { ref: "b", strength: 6 },
      { ref: "c", strength: 1 },
    ]);
    expect(res.winners).toEqual(["a"]);
    expect(res.isSplit).toBe(false);
  });

  it("splits on a tie at the top strength", () => {
    const res = resolveByStrength([
      { ref: "a", strength: 5 },
      { ref: "b", strength: 5 },
      { ref: "c", strength: 3 },
    ]);
    expect(res.winners.sort()).toEqual(["a", "b"]);
    expect(res.isSplit).toBe(true);
  });

  it("yields no winner for an empty set (everyone wrong / no choosers)", () => {
    const res = resolveByStrength([]);
    expect(res.winners).toEqual([]);
    expect(res.isSplit).toBe(false);
  });
});

describe("parseRule — data-driven DSL gate", () => {
  it("parses every catalog rule (round-trips DB jsonb → typed Rule)", () => {
    for (const def of HAND_RANK_CATALOG) {
      // Simulate the value arriving from a jsonb column.
      const raw = JSON.parse(JSON.stringify(def.rule));
      const parsed = parseRule(raw);
      expect(parsed).toEqual(def.rule);
    }
  });

  it("evaluates a rule parsed from raw JSON identically to the typed one", () => {
    const rawPair = {
      type: "anyOf",
      rules: [
        { type: "group", attribute: "nationality", min: 2 },
        { type: "group", attribute: "position", min: 2 },
        { type: "group", attribute: "club", min: 2 },
      ],
    };
    const rule = parseRule(rawPair);
    expect(evaluateRank(rule, [card("BR", "GK", ["X"]), card("BR", "DEF", ["Y"])])).toBe(
      true,
    );
  });

  it("throws on a malformed rule (bad attribute)", () => {
    expect(() => parseRule({ type: "group", attribute: "height", min: 2 })).toThrow();
  });

  it("throws on an unknown rule type", () => {
    expect(() => parseRule({ type: "mystery" })).toThrow();
  });
});
