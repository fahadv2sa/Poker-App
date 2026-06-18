import { describe, expect, it } from "vitest";
import { evaluateRank } from "../src/index.js";
import { card, ruleOf } from "./helpers.js";

/**
 * One describe block per rank (Section 7.2), positive + negative + the tricky
 * boundary cases called out in Section 18: multi-club, shared vs identical,
 * coverage, disjoint for TWO_PAIR and FULL_HOUSE, min thresholds, and the
 * club-usage rules (PAIR/TWO_PAIR/FULL_HOUSE_CLUB/ROYAL_CLUB use club;
 * TRIPLE/FULL_HOUSE never do).
 *
 * Rules come from the canonical catalog via `ruleOf` — the engine is being
 * tested against the exact DSL that gets seeded into HandRanks.
 */

describe("PAIR (strength 1) — one pair by nationality, position, or club", () => {
  const PAIR = ruleOf("PAIR");

  it("matches a nationality pair", () => {
    const pool = [card("BR", "GK", ["A"]), card("BR", "DEF", ["B"])];
    expect(evaluateRank(PAIR, pool)).toBe(true);
  });

  it("matches a position pair", () => {
    const pool = [card("BR", "GK", ["A"]), card("AR", "GK", ["B"])];
    expect(evaluateRank(PAIR, pool)).toBe(true);
  });

  it("matches a shared-club pair (club IS used for PAIR)", () => {
    const pool = [card("BR", "GK", ["RM"]), card("AR", "DEF", ["RM"])];
    expect(evaluateRank(PAIR, pool)).toBe(true);
  });

  it("rejects two cards with nothing shared", () => {
    const pool = [card("BR", "GK", ["A"]), card("AR", "DEF", ["B"])];
    expect(evaluateRank(PAIR, pool)).toBe(false);
  });

  it("rejects a single card (min 2 not met)", () => {
    expect(evaluateRank(PAIR, [card("BR", "GK", ["A"])])).toBe(false);
  });
});

describe("TWO_PAIR (strength 2) — two DISJOINT pairs", () => {
  const TWO_PAIR = ruleOf("TWO_PAIR");

  it("matches two nationality pairs on four distinct cards", () => {
    const pool = [
      card("BR", "GK", ["A"]),
      card("BR", "DEF", ["B"]),
      card("AR", "MID", ["C"]),
      card("AR", "FWD", ["D"]),
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(true);
  });

  it("matches a club pair plus a position pair (mixed attributes)", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]), // pair by club RM
      card("IT", "MID", ["X"]),
      card("ES", "MID", ["Y"]), // pair by position MID
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(true);
  });

  it("rejects when both pairs would need to share a card (not disjoint)", () => {
    // X is Brazilian GK; the only pairs are nat-BR {X,Y} and pos-GK {X,Z},
    // which overlap on X — so no two disjoint pairs exist.
    const pool = [
      card("BR", "GK", ["A"]), // X
      card("BR", "DEF", ["B"]), // Y  (nat pair with X)
      card("AR", "GK", ["C"]), // Z  (pos pair with X)
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(false);
  });

  it("rejects a single pair", () => {
    const pool = [
      card("BR", "GK", ["A"]),
      card("BR", "DEF", ["B"]),
      card("IT", "MID", ["C"]),
    ];
    expect(evaluateRank(TWO_PAIR, pool)).toBe(false);
  });
});

describe("TRIPLE (strength 3) — three by nationality, position, or shared club", () => {
  const TRIPLE = ruleOf("TRIPLE");

  it("matches three of a nationality", () => {
    const pool = [card("BR", "GK"), card("BR", "DEF"), card("BR", "MID")];
    expect(evaluateRank(TRIPLE, pool)).toBe(true);
  });

  it("matches three of a position", () => {
    const pool = [card("BR", "MID"), card("AR", "MID"), card("IT", "MID")];
    expect(evaluateRank(TRIPLE, pool)).toBe(true);
  });

  it("matches three sharing only a club (club now counts for TRIPLE)", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]),
    ];
    expect(evaluateRank(TRIPLE, pool)).toBe(true);
  });

  it("rejects only two of a nationality (min 3)", () => {
    const pool = [card("BR", "GK"), card("BR", "DEF"), card("IT", "MID")];
    expect(evaluateRank(TRIPLE, pool)).toBe(false);
  });
});

describe("LINEUP (strength 4) — all four positions covered", () => {
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

describe("FULL_HOUSE_CLUB (strength 5) — HAND_SIZE cards share ≥1 club", () => {
  const FHC = ruleOf("FULL_HOUSE_CLUB");

  it("matches five cards all sharing one club, even as a secondary club", () => {
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["RM", "JUV"]),
      card("IT", "MID", ["RM"]),
      card("ES", "FWD", ["RM", "PSG"]),
      card("FR", "MID", ["RM", "MCI"]),
    ];
    expect(evaluateRank(FHC, pool)).toBe(true);
  });

  it("rejects when only four cards share the club", () => {
    const pool = [
      card("BR", "GK", ["RM"]),
      card("AR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]),
      card("ES", "FWD", ["RM"]),
      card("FR", "MID", ["BAR"]),
      card("EN", "GK", ["JUV"]),
      card("PT", "DEF", ["PSG"]),
    ];
    expect(evaluateRank(FHC, pool)).toBe(false);
  });
});

describe("FULL_HOUSE (strength 6) — 3+2 disjoint, by club/position/nationality", () => {
  const FULL_HOUSE = ruleOf("FULL_HOUSE");

  it("matches three of a position + two of a nationality (disjoint)", () => {
    const pool = [
      card("BR", "GK"),
      card("AR", "GK"),
      card("IT", "GK"), // three GK
      card("ES", "DEF"),
      card("ES", "MID"), // two Spanish, disjoint from the GKs
    ];
    expect(evaluateRank(FULL_HOUSE, pool)).toBe(true);
  });

  it("matches three of a nationality + two of a position (disjoint)", () => {
    const pool = [
      card("BR", "DEF"),
      card("BR", "MID"),
      card("BR", "FWD"), // three Brazilians
      card("AR", "GK"),
      card("ES", "GK"), // two GK, disjoint from the Brazilians
    ];
    expect(evaluateRank(FULL_HOUSE, pool)).toBe(true);
  });

  it("rejects when the pair is a subset of the triple (no disjoint witness)", () => {
    // Three cards are each GK *and* Brazilian: there is a triple (by position
    // or nationality) but the second group can only reuse those same cards.
    const pool = [
      card("BR", "GK"),
      card("BR", "GK"),
      card("BR", "GK"),
      card("AR", "DEF"),
      card("IT", "MID"), // leftovers share neither nat nor pos
    ];
    expect(evaluateRank(FULL_HOUSE, pool)).toBe(false);
  });

  it("counts clubs now (3-of-a-club + 2-of-a-club IS a full house)", () => {
    const pool = [
      card("AR", "GK", ["RM"]),
      card("BR", "DEF", ["RM"]),
      card("IT", "MID", ["RM"]), // 3 share club RM
      card("ES", "FWD", ["BAR"]),
      card("FR", "GK", ["BAR"]), // 2 share club BAR
    ];
    expect(evaluateRank(FULL_HOUSE, pool)).toBe(true);
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

describe("ROYAL_CLUB (strength 9) — HAND_SIZE cards with IDENTICAL club set", () => {
  const RC = ruleOf("ROYAL_CLUB");
  const FHC = ruleOf("FULL_HOUSE_CLUB");

  it("matches five cards with the exact same club set", () => {
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["RM", "BAR"]),
      card("IT", "MID", ["RM", "BAR"]),
      card("ES", "FWD", ["RM", "BAR"]),
      card("FR", "MID", ["RM", "BAR"]),
    ];
    expect(evaluateRank(RC, pool)).toBe(true);
  });

  it("treats club-set equality as order-independent", () => {
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["BAR", "RM"]),
      card("IT", "MID", ["RM", "BAR"]),
      card("ES", "FWD", ["BAR", "RM"]),
      card("FR", "MID", ["RM", "BAR"]),
    ];
    expect(evaluateRank(RC, pool)).toBe(true);
  });

  it("shared-but-not-identical is FULL_HOUSE_CLUB, NOT ROYAL_CLUB", () => {
    // All five share RM (full house club) but their full club sets differ.
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["RM", "JUV"]),
      card("IT", "MID", ["RM"]),
      card("ES", "FWD", ["RM", "PSG"]),
      card("FR", "MID", ["RM", "MCI"]),
    ];
    expect(evaluateRank(FHC, pool)).toBe(true);
    expect(evaluateRank(RC, pool)).toBe(false);
  });

  it("rejects only four with an identical set", () => {
    const pool = [
      card("BR", "GK", ["RM", "BAR"]),
      card("AR", "DEF", ["RM", "BAR"]),
      card("IT", "MID", ["RM", "BAR"]),
      card("ES", "FWD", ["RM", "BAR"]),
      card("FR", "MID", ["RM"]),
    ];
    expect(evaluateRank(RC, pool)).toBe(false);
  });
});
