import { describe, expect, it } from "vitest";
import type { Action, LegalActions } from "@fb/engine";
import {
  ARCHETYPES,
  ARCHETYPE_KEYS,
  decide,
  handStrength,
  makePersonality,
  potOdds,
  STRONG_CUT,
  type DecisionContext,
} from "../src/bots/strategy.js";

/**
 * Pure unit tests for the bot decision engine (Phase 1). No DB, no sockets, no
 * clock — everything is deterministic via a seeded RNG, so the probabilistic
 * behaviors (bluffing, raising) can be measured with stable rates.
 */

/** Deterministic RNG (mulberry32) so probabilistic assertions are reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fully-permissive legal-actions shape; override per test. */
function legal(over: Partial<LegalActions> = {}): LegalActions {
  return {
    canCheck: false,
    canCall: true,
    callAmount: 100n,
    canRaise: true,
    minRaiseTo: 200n,
    maxRaiseTo: 2000n,
    canFold: true,
    canAllIn: true,
    allInTo: 2000n,
    ...over,
  };
}

function ctx(over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    legal: legal(),
    strength: 0.3,
    street: "FLOP",
    potOdds: 0.25,
    pot: 300n,
    personality: ARCHETYPES.balanced,
    rng: seeded(1),
    ...over,
  };
}

/** Run decide() N times with a seeded rng and tally the action types. */
function sample(n: number, base: Partial<DecisionContext>, seed = 12345) {
  const rng = seeded(seed);
  const counts: Record<Action["type"], number> = {
    CHECK: 0,
    CALL: 0,
    RAISE: 0,
    FOLD: 0,
    ALLIN: 0,
  };
  const decisions: Action[] = [];
  for (let i = 0; i < n; i++) {
    const d = decide(ctx({ ...base, rng }));
    counts[d.action.type]++;
    decisions.push(d.action);
  }
  return { counts, decisions };
}

describe("handStrength — reuses the engine evaluator, normalized to [0,1]", () => {
  const ranks = [
    { id: "PAIR", code: "PAIR", strength: 1, rule: { type: "group", attribute: "club", min: 2 } },
    { id: "ROYAL_CLUB", code: "ROYAL_CLUB", strength: 9, rule: { type: "group", attribute: "club", min: 5 } },
  ] as const;

  it("is 0 for a pool that achieves no rank", () => {
    const pool = [
      { nationality: "A", position: "GK", clubs: ["x"] },
      { nationality: "B", position: "DEF", clubs: ["y"] },
    ];
    expect(handStrength(pool, ranks as never)).toBe(0);
  });

  it("is 1.0 for the strongest rank (5 sharing a club ⇒ ROYAL_CLUB)", () => {
    const pool = Array.from({ length: 5 }, (_, i) => ({
      nationality: `N${i}`,
      position: "MID",
      clubs: ["shared"],
    }));
    expect(handStrength(pool, ranks as never)).toBe(1);
  });

  it("normalizes a mid rank against the catalog max", () => {
    const pool = [
      { nationality: "A", position: "GK", clubs: ["shared"] },
      { nationality: "B", position: "DEF", clubs: ["shared"] },
    ];
    // PAIR (strength 1) / max 9
    expect(handStrength(pool, ranks as never)).toBeCloseTo(1 / 9, 5);
  });
});

describe("potOdds", () => {
  it("is 0 when nothing is owed", () => {
    expect(potOdds(0n, 500n)).toBe(0);
  });
  it("is callAmount / (pot + callAmount)", () => {
    expect(potOdds(100n, 300n)).toBeCloseTo(0.25, 5);
  });
});

describe("decide — only ever returns a LEGAL action", () => {
  const shapes: { name: string; legal: LegalActions }[] = [
    { name: "open turn, can only check (no raise)", legal: legal({ canCheck: true, canCall: false, callAmount: 0n, canRaise: false, minRaiseTo: null }) },
    { name: "facing a bet: call or fold only", legal: legal({ canRaise: false, minRaiseTo: null, canAllIn: false }) },
    { name: "short stack facing a bet: all-in or fold only", legal: legal({ canCall: false, canRaise: false, minRaiseTo: null }) },
    { name: "open turn: check or bet", legal: legal({ canCheck: true, canCall: false, callAmount: 0n }) },
    { name: "fully permissive", legal: legal() },
  ];

  for (const shape of shapes) {
    it(`never emits an illegal action — ${shape.name}`, () => {
      const rng = seeded(99);
      for (let i = 0; i < 600; i++) {
        for (const strength of [0.0, 0.1, 0.3, 0.6, 0.95]) {
          for (const key of ARCHETYPE_KEYS) {
            const d = decide(ctx({ legal: shape.legal, strength, personality: ARCHETYPES[key], rng }));
            assertLegal(d.action, shape.legal);
          }
        }
      }
    });
  }
});

describe("decide — strong hands (>= STRONG_CUT) never fold", () => {
  it("never folds with a strong hand facing a bet, across all personalities", () => {
    for (const key of ARCHETYPE_KEYS) {
      const { counts } = sample(2000, {
        legal: legal(),
        strength: 0.95,
        personality: ARCHETYPES[key],
        potOdds: 0.4,
      }, 7);
      expect(counts.FOLD).toBe(0);
      // It should be doing something assertive/continuing, not nothing.
      expect(counts.RAISE + counts.CALL + counts.ALLIN).toBe(2000);
    }
  });

  it("a strength exactly at STRONG_CUT already never folds", () => {
    const { counts } = sample(1000, {
      legal: legal(),
      strength: STRONG_CUT,
      personality: ARCHETYPES.conservative,
      potOdds: 0.5,
    }, 3);
    expect(counts.FOLD).toBe(0);
  });
});

describe("decide — weak + aggressive sometimes raises (bluffs)", () => {
  it("a weak hand facing a bet still raises some of the time when aggressive", () => {
    const { counts } = sample(2000, {
      legal: legal(),
      strength: 0.08, // below the aggressive foldThreshold (0.2) ⇒ bluff band
      personality: ARCHETYPES.aggressive,
      potOdds: 0.3,
    }, 5);
    // Sometimes raises (bluff), but not always — and it also folds plenty.
    expect(counts.RAISE).toBeGreaterThan(0);
    expect(counts.RAISE).toBeLessThan(2000);
    expect(counts.FOLD).toBeGreaterThan(0);
  });

  it("a weak hand that can check bluff-bets at roughly its personality's bluffFreq", () => {
    const N = 5000;
    for (const key of ARCHETYPE_KEYS) {
      const p = ARCHETYPES[key];
      const { counts } = sample(N, {
        legal: legal({ canCheck: true, canCall: false, callAmount: 0n }),
        strength: 0.02, // clearly in the bluff band for every archetype
        street: "RIVER", // river ⇒ streetFactor 1, so the raw bluffFreq shows through
        personality: p,
        potOdds: 0,
      }, 4242);
      const betRate = counts.RAISE / N;
      // No fold/call possible here — only CHECK or a bluff RAISE.
      expect(counts.FOLD).toBe(0);
      expect(counts.CALL).toBe(0);
      expect(counts.CHECK + counts.RAISE).toBe(N);
      // Bluff rate tracks the personality's bluffFreq within tolerance.
      expect(betRate).toBeGreaterThan(Math.max(0, p.bluffFreq - 0.06));
      expect(betRate).toBeLessThan(p.bluffFreq + 0.06);
    }
  });

  it("aggressive bluffs strictly more often than conservative", () => {
    const mk = (key: "aggressive" | "conservative") =>
      sample(5000, {
        legal: legal({ canCheck: true, canCall: false, callAmount: 0n }),
        strength: 0.02,
        personality: ARCHETYPES[key],
        potOdds: 0,
      }, 808).counts.RAISE;
    expect(mk("aggressive")).toBeGreaterThan(mk("conservative"));
  });
});

describe("decide — sane bet sizing", () => {
  it("every RAISE is an integer raise-to within [minRaiseTo, maxRaiseTo]", () => {
    const { decisions } = sample(3000, {
      legal: legal({ minRaiseTo: 200n, maxRaiseTo: 2000n }),
      strength: 0.9, // strong ⇒ raises often, exercising the sizer a lot
      pot: 800n,
      personality: ARCHETYPES.aggressive,
    }, 21);
    const raises = decisions.filter((d) => d.type === "RAISE");
    expect(raises.length).toBeGreaterThan(0);
    for (const r of raises) {
      expect(typeof r.amount).toBe("bigint");
      expect(r.amount! >= 200n).toBe(true);
      expect(r.amount! <= 2000n).toBe(true);
    }
  });

  it("never raises when the only legal raise is a full-stack all-in (max == min)", () => {
    // A raise-to of maxRaiseTo commits the whole stack (= all-in); bots never go
    // all-in, so a degenerate band yields no RAISE at all (they check/call/fold).
    const { decisions } = sample(500, {
      legal: legal({ minRaiseTo: 200n, maxRaiseTo: 200n }),
      strength: 0.95,
      personality: ARCHETYPES.aggressive,
    }, 11);
    expect(decisions.some((d) => d.type === "RAISE")).toBe(false);
  });

  it("never emits an ALLIN action on any street or strength", () => {
    const rng = seeded(31);
    for (let i = 0; i < 3000; i++) {
      for (const street of ["PREFLOP", "FLOP", "TURN", "RIVER"] as const) {
        for (const strength of [0.0, 0.1, 0.5, 0.95]) {
          const d = decide(ctx({ street, strength, rng }));
          expect(d.action.type).not.toBe("ALLIN");
        }
      }
    }
  });

  it("never sizes a RAISE when raising is illegal — it checks or calls instead", () => {
    const { decisions } = sample(1000, {
      legal: legal({ canRaise: false, minRaiseTo: null }),
      strength: 0.95,
      personality: ARCHETYPES.aggressive,
    }, 13);
    expect(decisions.some((d) => d.type === "RAISE")).toBe(false);
  });
});

describe("decide — human-like delay", () => {
  it("returns a bounded, comfortably-paced think time (never instant, never absurd)", () => {
    const rng = seeded(77);
    let sum = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const d = decide(ctx({ rng, potOdds: i % 2 ? 0.6 : 0 }));
      expect(d.delayMs).toBeGreaterThanOrEqual(600); // floor — never a snap robot
      expect(d.delayMs).toBeLessThanOrEqual(11000); // cap — well under the 60s timer
      sum += d.delayMs;
    }
    // Humanized pacing: the average sits in a comfortable multi-second band, not rushed.
    expect(sum / N).toBeGreaterThan(2500);
  });
});

describe("makePersonality — per-identity variation", () => {
  it("returns the pure archetype with zero jitter", () => {
    expect(makePersonality("aggressive", 0)).toEqual(ARCHETYPES.aggressive);
  });

  it("produces varied-but-clamped params with jitter, staying in sane ranges", () => {
    const rng = seeded(2024);
    for (let i = 0; i < 500; i++) {
      const p = makePersonality("tricky", 0.3, rng);
      expect(p.archetype).toBe("tricky");
      expect(p.foldThreshold).toBeGreaterThanOrEqual(0.1);
      expect(p.foldThreshold).toBeLessThanOrEqual(0.6);
      expect(p.aggression).toBeGreaterThanOrEqual(0.05);
      expect(p.aggression).toBeLessThanOrEqual(0.95);
      expect(p.bluffFreq).toBeGreaterThanOrEqual(0);
      expect(p.bluffFreq).toBeLessThanOrEqual(0.5);
    }
  });

  it("two identities of the same archetype differ (not copies)", () => {
    const a = makePersonality("balanced", 0.3, seeded(1));
    const b = makePersonality("balanced", 0.3, seeded(2));
    expect(a).not.toEqual(b);
  });
});

// ---------------------------------------------------------------------------

function assertLegal(action: Action, l: LegalActions): void {
  switch (action.type) {
    case "CHECK":
      expect(l.canCheck).toBe(true);
      break;
    case "CALL":
      expect(l.canCall).toBe(true);
      break;
    case "RAISE":
      expect(l.canRaise).toBe(true);
      expect(l.minRaiseTo).not.toBeNull();
      expect(action.amount! >= (l.minRaiseTo as bigint)).toBe(true);
      expect(action.amount! <= l.maxRaiseTo).toBe(true);
      break;
    case "FOLD":
      expect(l.canFold).toBe(true);
      break;
    case "ALLIN":
      expect(l.canAllIn).toBe(true);
      break;
  }
}
