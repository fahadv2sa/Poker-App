import { computeXp, levelForXp, type MetricView } from "@fp/shared";
import type { Personality } from "./strategy.js";

/**
 * Deterministic fabricated profile for a bot identity (Phase 5). Pure: given a
 * personality and a seeded RNG, it produces believable, internally-consistent
 * career stats so a bot looks like a real player with history. Display only — bots
 * are excluded from live stats aggregation, so these numbers are never overwritten.
 *
 * Invariant: wins + losses + folds === matches. `level` is computed from the SAME
 * XP curve the real progression uses (computeXp/levelForXp), so a bot's level is
 * consistent with its displayed wins/profit.
 */
export interface BotProfile {
  matches: number;
  wins: number;
  losses: number;
  folds: number;
  netProfit: bigint;
  totalWon: bigint;
  totalLost: bigint;
  biggestWin: bigint;
  biggestLoss: bigint;
  biggestPot: bigint;
  longestWinStreak: number;
  xp: bigint;
  level: number;
  likesReceived: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function generateBotProfile(personality: Personality, rng: () => number): BotProfile {
  // Career length, skewed toward the lower-middle so most bots aren't veterans.
  const matches = 30 + Math.floor(rng() ** 1.4 * 790); // ~30..820
  // Personality shapes the fold rate (conservative folds more) and win rate.
  const foldRate = clamp(personality.foldThreshold * 0.8 + (rng() - 0.5) * 0.1, 0.1, 0.6);
  const folds = Math.round(matches * foldRate);
  const played = matches - folds;
  const winRateWhenPlayed = clamp(
    0.5 + (personality.aggression - 0.45) * 0.1 + (rng() - 0.5) * 0.12,
    0.35,
    0.65,
  );
  const wins = Math.min(played, Math.round(played * winRateWhenPlayed));
  const losses = matches - folds - wins; // ⇒ wins + losses + folds === matches

  // Plausible economy figures derived from the counts.
  const avgWin = 120 + Math.floor(rng() * 260);
  const avgLoss = 90 + Math.floor(rng() * 200);
  const totalWon = BigInt(wins * avgWin);
  const totalLost = BigInt(losses * avgLoss + folds * 25); // folds shed ~half an ante
  const netProfit = totalWon - totalLost;
  const biggestWin = BigInt(avgWin * (2 + Math.floor(rng() * 6)));
  const biggestLoss = BigInt(avgLoss * (2 + Math.floor(rng() * 5)));
  const biggestPot = biggestWin + BigInt(Math.floor(rng() * 500));
  const longestWinStreak = 1 + Math.floor(rng() * (3 + Math.floor(wins / 20)));
  const likesReceived = Math.floor(rng() ** 1.5 * 60);

  // Level from the real XP curve (computeXp reads wins/net_profit/matches only).
  const view = { matches, wins, net_profit: Number(netProfit) } as unknown as MetricView;
  const xp = computeXp(view, 0);
  const level = levelForXp(xp);

  return {
    matches,
    wins,
    losses,
    folds,
    netProfit,
    totalWon,
    totalLost,
    biggestWin,
    biggestLoss,
    biggestPot,
    longestWinStreak,
    xp: BigInt(xp),
    level,
    likesReceived,
  };
}

/** Deterministic RNG seeded by a bot's stable id (its player_number). */
export function seededRng(seed: number): () => number {
  let a = hashSeed(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
