/**
 * Guess the Player (خمن اللاعب) — shared constants (game #3).
 * Locked rules: 20s turn, 10-min round, 3 guess attempts, points only.
 * Approved decisions (2026-07-05): rooms 2–6 / quick play 2–4 with solo
 * VS_SYSTEM, matches = fixed rounds (default 3), no bots in v1.
 */

export const GP_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type GpDifficulty = (typeof GP_DIFFICULTIES)[number];

export const GP_MODES = ["VS_SYSTEM", "VS_HUMANS"] as const;
export type GpMode = (typeof GP_MODES)[number];

export const GP_QUESTION_TEMPLATES = [
  "CLUB_EVER",
  "CLUB_SEASON",
  "NATIONALITY",
  "NATIONAL_TEAM",
  "COMPETITION_EVER",
  "COMPETITION_SEASON",
  "TROPHY_EVER",
  "TROPHY_SEASON",
  "TROPHY_WITH_CLUB",
] as const;

export const GP_ROUND_END_REASONS = ["CORRECT_GUESS", "TIMER", "ABANDONED"] as const;

// Rounds are OPEN-ENDED (owner ruling 2026-07-06): a table session runs
// round after round via the winner-screen countdown until players leave —
// there is no rounds-per-match setting and no fixed match length.
export const GP_LIMITS = {
  minPlayers: 2,
  maxPlayers: 6,
  quickPlayMaxPlayers: 4,
  guessAttempts: 3,
} as const;

export const GP_TIMING = {
  /** Per-turn timer: one question OR one guess (30s — owner ruling
   *  2026-07-06, raised from the original 20s). */
  turnSec: 30,
  /** Round timer (locked rule). */
  roundSec: 600,
  /** VS_HUMANS: how long the picker has to choose the hidden player. */
  pickSec: 60,
  /** Reveal hold between rounds (everyone reads the answer + history). */
  nextRoundPauseMs: 6000,
  /** Reconnect grace before a dropped socket becomes a withdrawal (platform value). */
  reconnectGraceMs: 5 * 60 * 1000,
  /** Quick-play gather window before starting below max seats (solo allowed). */
  fillWindowSec: 8,
  /** Winner-screen countdown: the next match auto-starts for everyone still
   *  at the table when it hits zero; everyone pressing جولة جديدة starts it
   *  immediately (owner ruling 2026-07-06 — replaced the 45s ready-vote). */
  newMatchGraceSec: 15,
  /** A table with no HUMAN ACTION for this long closes immediately (final
   *  ruling #2) — auto-advancing turn timers do NOT count as activity. */
  idleCloseMs: 30 * 60 * 1000,
} as const;

/** XP = points earned (scoring already applies the difficulty multiplier), plus
 *  a match-winner bonus. Cosmetic level curve: L→L+1 costs base + (L-1)*step —
 *  GP points come in large chunks (100–750/round), hence the wider curve. */
export const GP_XP = {
  matchWinBonus: 100,
  levelBaseCost: 500,
  levelStep: 250,
} as const;
