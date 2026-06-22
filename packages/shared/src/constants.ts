/**
 * Game-wide constants. These reflect the FINAL decisions in Section 19 and the
 * default room config in Section 5. Defaults live here; per-room overrides are
 * stored in Games.config (jsonb).
 */
import type { Difficulty, ResolveMode } from "./enums.js";

/** Section 19.1 — HAND_SIZE = 5 for Royals and Full-House-Club. */
export const HAND_SIZE = 5;

/** Signup bonus (Section 1) and bank top-up amount. */
export const SIGNUP_BONUS = 1000n;
export const BANK_CLAIM_AMOUNT = 1000n;

/** Bank: max 2 claims per rolling 24h window (Section 1, 19). */
export const BANK_CLAIM_MAX_PER_WINDOW = 2;
export const BANK_CLAIM_WINDOW_HOURS = 24;

/** player_number sequence starts here, displayed as e.g. #100001 (Section 5). */
export const PLAYER_NUMBER_START = 100001;

/**
 * Inactivity auto-logout. A HUMAN session is invalidated after this much time
 * with no activity (no HTTP request and no socket event). Single source of truth
 * for the threshold — used as the rolling Auth.js JWT `maxAge` (web) AND as the
 * window the game-server checks `users.last_active_at` against at the Socket.IO
 * handshake. Change the threshold here and both layers follow.
 *
 * Bots (player_number >= BOT_PLAYER_NUMBER_BASE) are never subject to this — they
 * have no login and no socket, and the enforcement helpers skip them explicitly.
 */
export const SESSION_INACTIVITY_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
export const SESSION_INACTIVITY_SECONDS = SESSION_INACTIVITY_MS / 1000;

/**
 * Write-coalescing for activity tracking: `last_active_at` is advanced at most
 * once per user per this window (a conditional UPDATE no-ops otherwise), so the
 * hot paths (every authed request, every socket event) cost at most one cheap,
 * usually-zero-row write. Far smaller than SESSION_INACTIVITY_MS, so it never
 * affects whether a session is considered expired.
 */
export const ACTIVITY_WRITE_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Quick Play bot fillers (cold-start, removable). Bot user rows live in a RESERVED
 * player_number block at or above this base — far above where the real
 * autoincrement sequence (starting at 100001) will reach for the foreseeable
 * future. "Is this a bot?" is therefore `playerNumber >= BOT_PLAYER_NUMBER_BASE`,
 * needing NO schema column; full removal is `DELETE FROM users WHERE
 * player_number >= BOT_PLAYER_NUMBER_BASE`. Shared so the runtime and the (Phase 5)
 * importer agree.
 */
export const BOT_PLAYER_NUMBER_BASE = 900000;

/** True if a public player number belongs to a Quick Play bot (reserved block).
 *  Used to fence bots out of social surfaces (likes/friends/leaderboards). */
export function isBotPlayerNumber(playerNumber: number): boolean {
  return playerNumber >= BOT_PLAYER_NUMBER_BASE;
}

/** Default room config (Section 5 / 19.2). */
export const DEFAULT_GAME_CONFIG = {
  ante: 50,
  minRaise: 50,
  turnTimerSec: 60,
  claimTimerSec: 60,
  handSize: HAND_SIZE,
  allInMode: "side_pots",
  /** Feature #7: pause between hands before the room auto-deals the next one. */
  nextHandDelaySec: 5,
  /** How showdown ranks resolve (table-level). Default keeps the current
   *  self-declaration behavior; AUTO lets the server decide automatically. */
  resolveMode: "MANUAL",
} as const;

/**
 * Quick Play matchmaking (server-authoritative). One queue per difficulty tier;
 * a table auto-starts once `minPlayers` are queued and the fill window elapses
 * (or instantly at `maxSeats`). Quick Play reuses the normal table + wallet
 * mechanics — `entryByTier` is just the table's fixed ANTE per tier (no separate
 * buy-in charge; nothing is deducted while queued). All values tunable here.
 */
export const QUICK_PLAY = {
  minPlayers: 3,
  maxSeats: 6,
  fillWindowSec: 20,
  startGraceSec: 4,
  resolveMode: "AUTO",
  entryByTier: { EASY: 50, MEDIUM: 100, ELITE: 200 } as Record<Difficulty, number>,
  /**
   * Cold-start bot filling (only active when BOTS_ENABLED on the game-server).
   * When ≥1 human is queued but the table is below `minPlayers`, wait this short
   * window to gather more humans, then fill the rest of the seats with bots and
   * start. Distinct from `fillWindowSec` (the all-human path). Tables are filled
   * to a randomized size in [botFillMin, botFillMax] (capped at maxSeats), so they
   * aren't always full — harder to spot.
   */
  botFillWindowSec: 8,
  botFillMin: 4,
  botFillMax: 6,
} as const;

export type GameConfig = {
  ante: number;
  minRaise: number;
  turnTimerSec: number;
  claimTimerSec: number;
  handSize: number;
  allInMode: "side_pots";
  nextHandDelaySec: number;
  resolveMode: ResolveMode;
};
