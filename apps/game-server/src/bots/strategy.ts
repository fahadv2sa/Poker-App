import { bestAchievableRank, type Action, type HandRankDef, type LegalActions, type Pool } from "@fp/engine";
import type { BetRound } from "@fp/shared";

/**
 * Bot decision engine — PURE (Phase 1). No I/O, no DB, no clock, no sockets.
 * Given the legal actions (from the engine's `legalActions`), a normalized hand
 * strength (from the engine's evaluator), the betting context, and a
 * personality, it returns the action a believable human would take plus a
 * human-like decision delay. Deterministic for a given `rng`, so it is fully
 * unit-testable.
 *
 * IMPORTANT: nothing in the live game imports this module yet. Wiring (the
 * controller, the matchmaking bot-fill, the BOTS_ENABLED flag) is Phase 3+.
 * With the feature off, this file is simply unreferenced dead code — the base
 * game is unaffected.
 *
 * Design notes:
 *   - All money stays as BigInt to match the engine (`LegalActions` amounts are
 *     BigInt). Probabilities/strength/potOdds are plain numbers in [0,1].
 *   - decide() NEVER returns an illegal action: every branch is guarded by the
 *     corresponding `legal.canX`, with a CHECK/FOLD fallback that is always legal
 *     on a real turn.
 *   - "Strength" reuses the existing rank evaluator (`bestAchievableRank`) via
 *     `handStrength`; the engine is never re-implemented here.
 */

// ---------------------------------------------------------------------------
// Personalities
// ---------------------------------------------------------------------------

export type Archetype = "conservative" | "aggressive" | "tricky" | "balanced";

/**
 * Behavioral parameters for one bot. All in [0,1] except `betSizing`, which is a
 * pot fraction baseline (~0.4–0.9). A real identity gets one of the archetypes
 * plus small per-identity jitter (see `makePersonality`) so two bots of the same
 * archetype don't play identically.
 */
export interface Personality {
  archetype: Archetype;
  /** Strength below which the bot leans toward folding when facing a bet. */
  foldThreshold: number;
  /** Propensity to raise/bet rather than call/check. */
  aggression: number;
  /** Chance to bet/raise a WEAK hand (a bluff). */
  bluffFreq: number;
  /** Propensity to call marginal spots rather than fold (loose-passive). */
  callStation: number;
  /** Preferred bet/raise size as a fraction of the pot. */
  betSizing: number;
  /** How long the bot tends to "think" (scales the decision delay). */
  tankiness: number;
}

/** The four base archetypes. Per-identity variation is layered on via jitter. */
export const ARCHETYPES: Record<Archetype, Personality> = {
  conservative: {
    archetype: "conservative",
    foldThreshold: 0.45,
    aggression: 0.2,
    bluffFreq: 0.05,
    callStation: 0.3,
    betSizing: 0.5,
    tankiness: 0.4,
  },
  aggressive: {
    archetype: "aggressive",
    foldThreshold: 0.2,
    aggression: 0.75,
    bluffFreq: 0.25,
    callStation: 0.4,
    betSizing: 0.85,
    tankiness: 0.25,
  },
  tricky: {
    archetype: "tricky",
    foldThreshold: 0.3,
    aggression: 0.5,
    bluffFreq: 0.35,
    callStation: 0.45,
    betSizing: 0.7,
    tankiness: 0.5,
  },
  balanced: {
    archetype: "balanced",
    foldThreshold: 0.32,
    aggression: 0.45,
    bluffFreq: 0.15,
    callStation: 0.4,
    betSizing: 0.65,
    tankiness: 0.4,
  },
};

export const ARCHETYPE_KEYS: readonly Archetype[] = [
  "conservative",
  "aggressive",
  "tricky",
  "balanced",
];

/**
 * Build a personality from an archetype plus optional jitter. `jitter` (0..1)
 * is the maximum ± fraction applied to each numeric parameter, drawn from `rng`,
 * then clamped to sane ranges. `jitter = 0` returns the pure archetype.
 */
export function makePersonality(
  archetype: Archetype,
  jitter = 0,
  rng: () => number = Math.random,
): Personality {
  const base = ARCHETYPES[archetype];
  if (jitter <= 0) return { ...base };
  const wob = (v: number, lo: number, hi: number) =>
    clamp(v * (1 + (rng() * 2 - 1) * jitter), lo, hi);
  return {
    archetype,
    foldThreshold: wob(base.foldThreshold, 0.1, 0.6),
    aggression: wob(base.aggression, 0.05, 0.95),
    bluffFreq: wob(base.bluffFreq, 0, 0.5),
    callStation: wob(base.callStation, 0.1, 0.7),
    betSizing: wob(base.betSizing, 0.3, 1.2),
    tankiness: wob(base.tankiness, 0.1, 0.9),
  };
}

/**
 * A stable, reproducible personality for a bot identity, derived purely from its
 * stable numeric id (its reserved `player_number`). The same id always yields the
 * same archetype + jitter, so no personality state ever needs to be stored, and
 * the Phase 5 importer and the runtime agree with no shared file. Pure.
 */
export function personalityForSeed(seed: number): Personality {
  const rng = mulberry32(hashSeed(seed));
  const archetype = ARCHETYPE_KEYS[Math.floor(rng() * ARCHETYPE_KEYS.length)]!;
  return makePersonality(archetype, 0.3, rng);
}

/** Integer scramble so adjacent ids (900001, 900002, …) diverge sharply. */
function hashSeed(seed: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Small deterministic PRNG (mulberry32) for seed-derived personalities. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Decision context + result
// ---------------------------------------------------------------------------

export interface DecisionContext {
  /** Legal actions for this seat, from the engine's `legalActions`. */
  legal: LegalActions;
  /** Normalized hand strength in [0,1] (see `handStrength`). */
  strength: number;
  /** Which street it is (affects only the think-time, lightly). */
  street: BetRound;
  /** Pot odds in [0,1) = callAmount / (pot + callAmount); 0 when nothing owed. */
  potOdds: number;
  /** Current distributable pot, for sizing a raise (BigInt to match the engine). */
  pot: bigint;
  personality: Personality;
  /** Injectable RNG for determinism in tests; defaults to Math.random. */
  rng?: () => number;
}

export interface BotDecision {
  /** Exactly the shape `GameRoom.placeAction` consumes. */
  action: Action;
  /** Human-like delay (ms) the controller should wait before applying. */
  delayMs: number;
}

/** Hands at or above this normalized strength are "strong" — they never fold. */
export const STRONG_CUT = 0.5;

// ---------------------------------------------------------------------------
// Strength + pot-odds helpers (reuse the real evaluator)
// ---------------------------------------------------------------------------

/**
 * Normalized hand strength in [0,1] for a 7-card (or fewer, pre-river) pool,
 * computed from the SAME engine evaluator the winner logic uses. 0 when the pool
 * achieves no rank; 1 for the strongest rank in the catalog. Display/decision
 * only — never affects the authoritative outcome.
 */
export function handStrength(pool: Pool, ranks: readonly HandRankDef[]): number {
  const best = bestAchievableRank(pool, ranks);
  if (!best) return 0;
  const max = Math.max(1, ...ranks.map((r) => r.strength));
  return clamp01(best.strength / max);
}

/** Pot odds in [0,1): the fraction of the (post-call) pot the call costs. */
export function potOdds(callAmount: bigint, pot: bigint): number {
  if (callAmount <= 0n) return 0;
  const c = Number(callAmount);
  const p = Number(pot);
  return c / (p + c);
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

/**
 * Decide a bot's action for the current turn. Pure and total: always returns a
 * LEGAL action (guarded by `legal.canX`, with a CHECK/FOLD fallback that is
 * always available on a real turn).
 */
export function decide(ctx: DecisionContext): BotDecision {
  const { legal, personality: p } = ctx;
  const rng = ctx.rng ?? Math.random;
  const value = clamp01(ctx.strength);
  const delayMs = computeDelayMs(ctx, rng);
  // Betting is near-passive pre-flop and escalates flop→turn→river. This factor
  // scales the raise/bluff frequency (and bet sizing, in sizeRaise) by street, so
  // bots no longer open aggressively before any community cards are revealed.
  const sf = streetFactor(ctx.street);

  // Always-legal fallback on a turn: CHECK if nothing is owed, otherwise FOLD.
  const fallback = (): Action => (legal.canCheck ? { type: "CHECK" } : { type: "FOLD" });

  const tryRaise = (): Action | null => {
    if (!legal.canRaise || legal.minRaiseTo === null) return null;
    // Bots never go all-in: skip when the only legal raise commits the whole
    // stack (a raise-to of maxRaiseTo is an all-in). sizeRaise keeps a margin too.
    if (legal.minRaiseTo >= legal.maxRaiseTo) return null;
    return { type: "RAISE", amount: sizeRaise(ctx, rng) };
  };

  const facingBet = legal.callAmount > 0n;

  // ── Not facing a bet: CHECK, or bet for value / as a bluff (a RAISE-from-0) ──
  if (!facingBet) {
    if (rng() < raiseProb(value, p, false) * sf) {
      const r = tryRaise();
      if (r) return { action: r, delayMs };
    }
    return { action: legal.canCheck ? { type: "CHECK" } : fallback(), delayMs };
  }

  // ── Facing a bet ──
  // 1) Maybe raise (value-raise when strong; bluff-raise when weak), escalating
  //    by street so pre-flop stays near-passive.
  if (rng() < raiseProb(value, p, true) * sf) {
    const r = tryRaise();
    if (r) return { action: r, delayMs };
  }
  // 2) Otherwise call or fold. Strong hands have callProb 1 → they never fold.
  //    Bots never shove: if they can't legally CALL, they fold.
  if (rng() < callProb(value, ctx.potOdds, p)) {
    if (legal.canCall) return { action: { type: "CALL" }, delayMs };
  }
  return { action: legal.canFold ? { type: "FOLD" } : fallback(), delayMs };
}

// ---------------------------------------------------------------------------
// Probability + sizing internals
// ---------------------------------------------------------------------------

/**
 * Probability of raising/betting. Three bands:
 *   - strong (>= STRONG_CUT): aggressive value-raising, never tiny.
 *   - medium: scales with aggression and value (a touch lower when facing a bet).
 *   - weak  (< foldThreshold): raises ONLY as a bluff, at exactly `bluffFreq`,
 *     which makes a bot's bluff rate measurable and bounded by its personality.
 */
function raiseProb(value: number, p: Personality, facingBet: boolean): number {
  if (value >= STRONG_CUT) return clamp01(0.55 + 0.45 * p.aggression);
  if (value >= p.foldThreshold) return clamp01(p.aggression * value * (facingBet ? 0.8 : 1));
  return clamp01(p.bluffFreq);
}

/**
 * Probability of continuing (call) rather than folding when facing a bet and not
 * raising. Strong hands always continue (1). Otherwise the hand value must roughly
 * beat the pot odds, softened by how much of a call-station the personality is and
 * tightened by its fold threshold.
 */
function callProb(value: number, odds: number, p: Personality): number {
  if (value >= STRONG_CUT) return 1;
  const edge = value - odds;
  return clamp01(0.5 + edge * 1.5 + p.callStation * 0.3 - (1 - p.foldThreshold) * 0.2);
}

/**
 * Size a raise as a pot-fraction around the personality baseline (with jitter),
 * always snapped into the legal [minRaiseTo, maxRaiseTo] band. Integer BigInt
 * math throughout, so the result is always a whole, legal raise-to total.
 */
function sizeRaise(ctx: DecisionContext, rng: () => number): bigint {
  const { legal, pot, personality: p } = ctx;
  const min = legal.minRaiseTo as bigint; // non-null: caller only sizes when canRaise
  // Cap strictly below a full-stack commit (maxRaiseTo) so a bot never raises
  // all-in; if only a min-raise fits, take it.
  const max = legal.maxRaiseTo > min ? legal.maxRaiseTo - 1n : min;
  if (max <= min) return min;
  // Bet smaller early and larger late: scale the pot fraction by the street.
  const frac = clamp(p.betSizing + (rng() - 0.5) * 0.3, 0.25, 1.5) * streetFactor(ctx.street);
  const target = min + (pot * BigInt(Math.round(frac * 1000))) / 1000n;
  return clampBig(target, min, max);
}

/**
 * Per-street escalation factor for raise/bluff frequency and bet sizing: betting
 * is near-passive PRE-FLOP (bots mostly check/call before any board), then ramps
 * up across the flop, turn and river. Multiplied into `raiseProb` and the
 * bet-size pot fraction only — never into calling — so pre-flop stays
 * check/call rather than aggressive.
 */
function streetFactor(street: BetRound): number {
  switch (street) {
    case "PREFLOP":
      return 0.2;
    case "FLOP":
      return 0.5;
    case "TURN":
      return 0.75;
    default: // RIVER
      return 1;
  }
}

/**
 * A human-like think time (ms). Tuned to feel comfortable to play against (not
 * rushed / robotic): a wider base, more for tanky personalities and for bigger
 * decisions (high pot odds), an occasional deliberate long "tank", and an
 * occasional snap on an obvious spot. Common band ~1.5–6s, floor 0.6s (rare snap),
 * up to ~11s (rare tank), averaging ~4s — and varied per personality via
 * `tankiness` (+ per-identity jitter), so bots don't pause identically. Always far
 * under the 60s turn timer (and the controller additionally clamps to act before
 * the deadline). Never instant, never a fixed cadence.
 */
function computeDelayMs(ctx: DecisionContext, rng: () => number): number {
  const { personality: p } = ctx;
  // Base think time — a real beat, not a snap reaction.
  let ms = 1200 + rng() * 2600; // ~1.2–3.8s
  // Tanky personalities mull longer (conservative / tricky > aggressive).
  ms += p.tankiness * rng() * 3500; // up to ~+3.5s
  // Bigger decisions (facing pot-relative pressure) take longer.
  ms += ctx.potOdds * 2500; // up to +2.5s
  // Occasional deliberate long "tank" (~8% of the time).
  if (rng() < 0.08) ms += 2000 + rng() * 4000; // +2–6s
  // Occasional snap on an obvious spot (~12%).
  if (rng() < 0.12) ms *= 0.5;
  // Natural human bounds.
  return Math.round(Math.min(11000, Math.max(600, ms)));
}

// ---------------------------------------------------------------------------
// Tiny numeric helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampBig(v: bigint, lo: bigint, hi: bigint): bigint {
  return v < lo ? lo : v > hi ? hi : v;
}
