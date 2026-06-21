import { describe, expect, it } from "vitest";
import { evaluateRank } from "../src/index.js";
import { card, ruleOf } from "./helpers.js";

/**
 * One describe block per rank (Section 7.2). After the clubs-only rework,
 * PAIR / TWO_PAIR / TRIPLE / FULL_HOUSE depend on SHARED CLUBS only — nationality
 * and position no longer trigger them. ROYAL_CLUB = 5 share ≥1 club, and
 * FULL_HOUSE_CLUB = 4 share ≥1 club. ROYAL_NATION, ROYAL_POSITION and LINEUP are
 * unchanged. Rules come from the canonical catalog via `ruleOf` — the engine is
 * tested against the exact DSL that gets seeded into HandRanks.
 */

describe("PAIR (strength 1) — two players sharing a club (clubs only)", () => {
  const PAIR = ruleOf("PAIR");

  it("matches a shared-club pair", () => {
    const pool = [card("BR", "GK", ["RM"]), card("AR", "DEF", ["RM"])];
    expect(evaluateRank(PAIR, pool)).toBe(true);
  });

  it("rejects a nationality-only pair (nationality no longer counts)", () => {
    const pool = [card("BR", "GK", ["A"]), card("BR", "DEF", ["B"])];
    expect(evaluateRank(PAIR, pool)).toBe(false);
  });

  it("rejects a position-only pair (position no longer counts)", () => {
    const pool = [card("BR", "GK", ["A"]), card("AR", "GK", ["B"])];
    expect(evaluateRank(PAIR, pool)).toBe(false);
  });

  it("rejects two cards with no shared club", () => {
    const pool = [card("BR", "GK", ["A"]), card("AR", "DEF", ["B"])];
    expect(evaluateRank(PAIR, pool)).toBe(false);
  });

  it("rejects a single card (min 2 not met)", () => {
    expect(evaluateRank(PAIR, [card("BR", "GK", ["RM"])])).toBe(false);
  });
});

describe("TWO_PAIR (strength 2) — two DISJOINT club pairs (clubs only)", () => {
  const TWO_PAIR = ruleOf("TWO_PAIR");

  it("matches two club pairs on four distinct cards", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]), // pair by club RM
      card("IT", "MID", ["BAR"]),
      card("ES", "FWD", ["BAR"]), // pair by club BAR
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(true);
  });

  it("rejects nationality + position pairs (no shared clubs)", () => {
    const pool = [
      card("BR", "GK", ["A"]),
      card("BR", "DEF", ["B"]), // nationality pair — no club
      card("IT", "MID", ["C"]),
      card("ES", "MID", ["D"]), // position pair — no club
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(false);
  });

  it("rejects when both club pairs would need to share a card (not disjoint)", () => {
    // X is the only RM/BAR bridge: pairs {X,Y} by RM and {X,Z} by BAR overlap on X.
    const pool = [
      card("BR", "GK", ["RM", "BAR"]), // X
      card("AR", "DEF", ["RM"]), // Y (RM pair with X)
      card("IT", "MID", ["BAR"]), // Z (BAR pair with X)
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(false);
  });

  it("rejects a single club pair", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
      card("IT", "MID", ["X"]),
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(false);
  });
});

describe("TRIPLE (strength 3) — three players sharing a club (clubs only)", () => {
  const TRIPLE = ruleOf("TRIPLE");

  it("matches three sharing a club", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]),
    ];
    expect(evaluateRank(TRIPLE, pool)).toBe(true);
  });

  it("rejects three of a nationality (nationality no longer counts)", () => {
    const pool = [card("BR", "GK"), card("BR", "DEF"), card("BR", "MID")];
    expect(evaluateRank(TRIPLE, pool)).toBe(false);
  });

  it("rejects three of a position (position no longer counts)", () => {
    const pool = [card("BR", "MID"), card("AR", "MID"), card("IT", "MID")];
    expect(evaluateRank(TRIPLE, pool)).toBe(false);
  });

  it("rejects only two sharing a club (min 3)", () => {
    const pool = [card("BR", "GK", ["RM"]), card("AR", "DEF", ["RM"]), card("IT", "MID", ["X"])];
    expect(evaluateRank(TRIPLE, pool)).toBe(false);
  });
});

describe("LINEUP (strength 5) — all four positions covered", () => {
  const LINEUP = ruleOf("LINEUP");

  it("matches GK + DEF + MID + FWD", () => {
    const pool = [
      card("BR", "GK"),
      card("AR", "DEF"),
      card("IT", "MID"),
      card("ES", "FWD"),
    ];
    expect(evaluateRank(LINEUP, pool)).toBe(true);
  });

  it("matches even with extra duplicate positions present", () => {
    const pool = [
      card("BR", "GK"),
      card("AR", "DEF"),
      card("IT", "MID"),
      card("ES", "FWD"),
      card("FR", "MID"),
      card("EN", "FWD"),
      card("PT", "DEF"),
    ];
    expect(evaluateRank(LINEUP, pool)).toBe(true);
  });

  it("rejects when a position is missing (no FWD)", () => {
    const pool = [
      card("BR", "GK"),
      card("AR", "DEF"),
      card("IT", "MID"),
      card("ES", "MID"),
    ];
    expect(evaluateRank(LINEUP, pool)).toBe(false);
  });
});

describe("FULL_HOUSE_CLUB (strength 6) — 4 cards share ≥1 club", () => {
  const FHC = ruleOf("FULL_HOUSE_CLUB");

  it("matches four cards all sharing one club, even as a secondary club", () => {
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["RM", "JUV"]),
      card("IT", "MID", ["RM"]),
      card("ES", "FWD", ["RM", "PSG"]),
      card("FR", "MID", ["X"]),
    ];
    expect(evaluateRank(FHC, pool)).toBe(true);
  });

  it("rejects when only three cards share the club", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]),
      card("ES", "FWD", ["BAR"]),
      card("FR", "MID", ["JUV"]),
    ];
    expect(evaluateRank(FHC, pool)).toBe(false);
  });
});

describe("FULL_HOUSE (strength 4) — 3-of-a-club + 2-of-a-club, disjoint (clubs only)", () => {
  const FULL_HOUSE = ruleOf("FULL_HOUSE");

  it("matches three sharing a club + two sharing another club (disjoint)", () => {
    const pool = [
      card("AR", "GK", ["RM"]),
      card("BR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]), // 3 share club RM
      card("ES", "FWD", ["BAR"]),
      card("FR", "GK", ["BAR"]), // 2 share club BAR
    ];
    expect(evaluateRank(FULL_HOUSE, pool)).toBe(true);
  });

  it("rejects a nationality/position 3+2 with no shared clubs", () => {
    const pool = [
      card("BR", "GK"),
      card("BR", "DEF"),
      card("BR", "MID"), // three Brazilians, no clubs
      card("ES", "FWD"),
      card("ES", "GK"), // two Spanish, no clubs
    ];
    expect(evaluateRank(FULL_HOUSE, pool)).toBe(false);
  });

  it("rejects when only a club-triple exists with no disjoint club-pair", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]), // 3 share RM
      card("ES", "FWD", ["BAR"]),
      card("FR", "GK", ["JUV"]), // leftovers share no club
    ];
    expect(evaluateRank(FULL_HOUSE, pool)).toBe(false);
  });
});

describe("ROYAL_POSITION (strength 7) — HAND_SIZE same position", () => {
  const RP = ruleOf("ROYAL_POSITION");

  it("matches five of the same position", () => {
    const pool = [
      card("BR", "MID"),
      card("AR", "MID"),
      card("IT", "MID"),
      card("ES", "MID"),
      card("FR", "MID"),
    ];
    expect(evaluateRank(RP, pool)).toBe(true);
  });

  it("rejects only four of a position", () => {
    const pool = [
      card("BR", "MID"),
      card("AR", "MID"),
      card("IT", "MID"),
      card("ES", "MID"),
      card("FR", "FWD"),
    ];
    expect(evaluateRank(RP, pool)).toBe(false);
  });
});

describe("ROYAL_NATION (strength 8) — HAND_SIZE same nationality", () => {
  const RN = ruleOf("ROYAL_NATION");

  it("matches five of the same nationality", () => {
    const pool = [
      card("BR", "GK"),
      card("BR", "DEF"),
      card("BR", "MID"),
      card("BR", "FWD"),
      card("BR", "MID"),
    ];
    expect(evaluateRank(RN, pool)).toBe(true);
  });

  it("rejects only four of a nationality", () => {
    const pool = [
      card("BR", "GK"),
      card("BR", "DEF"),
      card("BR", "MID"),
      card("BR", "FWD"),
      card("AR", "MID"),
    ];
    expect(evaluateRank(RN, pool)).toBe(false);
  });
});

describe("ROYAL_CLUB (strength 9) — 5 cards share ≥1 club", () => {
  const RC = ruleOf("ROYAL_CLUB");
  const FHC = ruleOf("FULL_HOUSE_CLUB");

  it("matches five cards all sharing one club, even as a secondary club", () => {
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["RM", "JUV"]),
      card("IT", "MID", ["RM"]),
      card("ES", "FWD", ["RM", "PSG"]),
      card("FR", "MID", ["RM", "MCI"]),
    ];
    expect(evaluateRank(RC, pool)).toBe(true);
  });

  it("matches five with the exact same club set (identical is a special case of shared)", () => {
    const set = ["RM", "BAR"];
    const pool = [
      card("BR", "GK", set),
      card("AR", "DEF", [...set].reverse()),
      card("IT", "MID", set),
      card("ES", "FWD", set),
      card("FR", "MID", set),
    ];
    expect(evaluateRank(RC, pool)).toBe(true);
  });

  it("only four sharing a club is FULL_HOUSE_CLUB, NOT ROYAL_CLUB", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]),
      card("ES", "FWD", ["RM"]),
      card("FR", "MID", ["BAR"]),
    ];
    expect(evaluateRank(FHC, pool)).toBe(true);
    expect(evaluateRank(RC, pool)).toBe(false);
  });
});
