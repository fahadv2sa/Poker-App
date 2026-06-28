import { describe, it, expect } from "vitest";
import { evaluateGate } from "../src/index.js";
import type { CandidateRow } from "../src/index.js";

const row = (p: Partial<CandidateRow> & { playerId: string }): CandidateRow => ({
  value: 5,
  appearances: 30,
  fame: 50,
  name: p.playerId,
  nameAr: p.playerId,
  ...p,
});

/** 25 well-filled regulars with positive goals → a clean, admittable list. */
function goodRows(): CandidateRow[] {
  return Array.from({ length: 25 }, (_, i) => row({ playerId: `p${i}`, value: 25 - i }));
}

describe("evaluateGate", () => {
  it("admits a complete, well-filled comp/season", () => {
    const res = evaluateGate(goodRows());
    expect(res.admit).toBe(true);
    expect(res.reasons).toHaveLength(0);
    expect(res.metrics.tenthValue).toBeGreaterThan(0);
  });

  it("rejects when too few qualifiers (no real top-10)", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ playerId: `p${i}`, value: 8 - i }));
    const res = evaluateGate(rows);
    expect(res.admit).toBe(false);
    expect(res.reasons.join()).toMatch(/qualifiers|positive value/);
  });

  it("rejects when the stat is sparsely recorded among regulars", () => {
    // 25 regulars but only 10% have the stat (the passes_accuracy collapse case)
    const rows = Array.from({ length: 25 }, (_, i) =>
      row({ playerId: `p${i}`, value: i < 3 ? 20 - i : null }),
    );
    const res = evaluateGate(rows);
    expect(res.admit).toBe(false);
    expect(res.reasons.join()).toMatch(/fill/);
  });
});
