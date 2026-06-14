/**
 * Game-wide constants. These reflect the FINAL decisions in Section 19 and the
 * default room config in Section 5. Defaults live here; per-room overrides are
 * stored in Games.config (jsonb).
 */

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

/** Default room config (Section 5 / 19.2). */
export const DEFAULT_GAME_CONFIG = {
  ante: 50,
  minRaise: 50,
  turnTimerSec: 60,
  claimTimerSec: 60,
  handSize: HAND_SIZE,
  allInMode: "side_pots",
} as const;

export type GameConfig = {
  ante: number;
  minRaise: number;
  turnTimerSec: number;
  claimTimerSec: number;
  handSize: number;
  allInMode: "side_pots";
};
