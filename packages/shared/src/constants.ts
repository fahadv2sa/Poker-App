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

/** One-time reward for adding the app to the home screen (installing the PWA).
 *  Granted exactly once per account, server-side, only after a real install. */
export const INSTALL_REWARD_AMOUNT = 10000n;

/** Bank: max 2 claims per rolling 24h window (legacy; superseded by the
 *  level-based daily claim below — kept for any external reference). */
export const BANK_CLAIM_MAX_PER_WINDOW = 2;
export const BANK_CLAIM_WINDOW_HOURS = 24;

/**
 * Daily bank claim, level-scaled: a player may claim ONCE per day, for
 * `level × BANK_CLAIM_PER_LEVEL` coins (level 1 → 1000, level 2 → 2000, …).
 * Server-authoritative (the level is read at claim time, the once-per-day rule
 * enforced under a row lock).
 */
export const BANK_CLAIM_PER_LEVEL = 1000n;

/**
 * The bank's "daily" reset is anchored to Asia/Riyadh (UTC+3). Saudi Arabia
 * observes NO daylight saving, so this fixed offset is exact year-round — a claim
 * is allowed once per Riyadh calendar day, resetting at 00:00 Riyadh.
 */
export const BANK_RESET_TZ_OFFSET_HOURS = 3;

/**
 * Between hands, the winner screen runs a server-authoritative "ready check": the
 * next round starts as soon as ALL connected humans press "New Round" (bots are
 * auto-ready), or automatically once this grace period elapses — so a table can
 * never hang waiting on someone who left or went idle.
 */
export const NEW_ROUND_GRACE_SEC = 15;

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
export const SESSION_INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SESSION_INACTIVITY_SECONDS = SESSION_INACTIVITY_MS / 1000;

/**
 * Reconnection grace. When a player's socket drops mid-session (e.g. backgrounding
 * the tab to read a notification/message), their table SEAT and the room are HELD
 * this long so a reconnect restores them seamlessly — a dropped socket is NOT
 * treated as leaving the table. The real cleanup (drop seat, announce left, tear
 * down an emptied room) only runs on an explicit leave/close, or when the grace
 * expires with no reconnect. Connection is otherwise only lost on manual logout
 * or the inactivity auto-logout above.
 */
export const RECONNECT_GRACE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Write-coalescing for activity tracking: `last_active_at` is advanced at most
 * once per user per this window (a conditional UPDATE no-ops otherwise), so the
 * hot paths (every authed request, every socket event) cost at most one cheap,
 * usually-zero-row write. Far smaller than SESSION_INACTIVITY_MS, so it never
 * affects whether a session is considered expired.
 */
export const ACTIVITY_WRITE_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Email OTP verification (signup). A 6-digit numeric code, valid for at most
 * OTP_TTL — short-lived by design so rows never linger (data-hygiene). At most
 * ONE active code per user (the DB enforces it via a unique user_id); a re-issue
 * UPSERTS that row, so codes never pile up.
 *
 * Resend policy: the core rule is "no new code while the current one is valid",
 * but a strictly-enforced wait would strand a user whose email never arrived — so
 * a resend is allowed after OTP_RESEND_COOLDOWN, and it REPLACES the active code
 * (re-hashes, resets the TTL and attempt counter). OTP_MAX_ATTEMPTS caps wrong
 * guesses before the code is invalidated, making the 10^6 space unbruteforceable
 * inside the TTL window. The pending-verification cookie that carries identity to
 * /verify lives PENDING_VERIFICATION_TTL.
 */
export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60; // 5 minutes (max code lifetime)
export const OTP_RESEND_COOLDOWN_SECONDS = 60; // earliest a resend may replace the code
export const OTP_MAX_ATTEMPTS = 5; // wrong guesses before the code is killed
export const PENDING_VERIFICATION_TTL_SECONDS = 20 * 60; // signed cookie carrying the unverified user to /verify

/** OTP request ceilings (defence-in-depth on top of the cooldown + one-row rule). */
export const OTP_MAX_REQUESTS_PER_ACCOUNT = 5; // per OTP_REQUEST_WINDOW, per user
export const OTP_REQUEST_WINDOW_SECONDS = 15 * 60; // 15 minutes

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
  turnTimerSec: 30,
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
