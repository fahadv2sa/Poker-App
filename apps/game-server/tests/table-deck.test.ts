import { describe, expect, it } from "vitest";
import { TableDeck } from "../src/cards.js";

/** pool of n ids: "p0".."p{n-1}". */
const pool = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe("TableDeck — single-deck, no-repeat dealing", () => {
  it("consumes every card exactly once before reshuffling (pool a multiple of need)", () => {
    const deck = new TableDeck(pool(12));
    const need = 3; // 12 / 3 = 4 full rounds = one full deck
    const seen: string[] = [];
    for (let r = 0; r < 4; r++) seen.push(...deck.draw(need));
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12); // no repeats — full pool, each once
    expect([...seen].sort()).toEqual(pool(12).sort());
  });

  it("never repeats a player until the deck is exhausted", () => {
    const deck = new TableDeck(pool(100));
    const need = 7; // floor(100/7) = 14 full rounds = 98 cards before reshuffle
    const seen = new Set<string>();
    for (let r = 0; r < 14; r++) {
      for (const id of deck.draw(need)) {
        expect(seen.has(id)).toBe(false); // no repeat within a full deck
        seen.add(id);
      }
    }
    expect(seen.size).toBe(98);
  });

  it("keeps each round internally distinct across a reshuffle boundary (top-up)", () => {
    const deck = new TableDeck(pool(10));
    const need = 3; // 10 is NOT a multiple of 3 → round 4 spans the reshuffle
    for (let r = 0; r < 6; r++) {
      const round = deck.draw(need);
      expect(round).toHaveLength(need);
      expect(new Set(round).size).toBe(need); // no duplicate card in one hand
    }
  });

  it("reshuffles and allows repetition once the deck is exhausted", () => {
    const deck = new TableDeck(pool(5));
    const need = 5; // each round consumes the whole pool
    const round1 = deck.draw(need);
    const round2 = deck.draw(need); // deck exhausted → reshuffle → repeats allowed
    expect([...round1].sort()).toEqual(pool(5).sort());
    expect([...round2].sort()).toEqual(pool(5).sort()); // same players reappear
  });

  it("throws when a single round needs more cards than the pool holds", () => {
    const deck = new TableDeck(pool(3));
    expect(() => deck.draw(5)).toThrow(/needs 5 cards but the pool holds only 3/);
  });

  it("rejects an empty pool", () => {
    expect(() => new TableDeck([])).toThrow(/empty player pool/);
  });
});
