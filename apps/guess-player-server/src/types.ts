import type { GpFactPack } from "@fb/guess-player-engine";
import type { GpDifficulty, GpMode, GpQuestionView, GpWrongGuessView } from "@fb/shared";
import type { GpPlayerRef } from "@fb/db";

export interface GpSeat {
  seat: number;
  userId: string;
  username: string;
  playerNumber: number;
  connected: boolean;
  socketId?: string;
  totalPoints: number; // accumulated across the match
  status: "ACTIVE" | "WITHDRAWN";
  /** Anti-cheat presence: switched away without leaving. Transient. */
  away?: boolean;
  /** Grace timer handle when a human socket drops (held, not removed). */
  graceTimer?: ReturnType<typeof setTimeout>;
}

export interface ActiveGpRound {
  roundNo: number;
  /** DB row id for this round (created at round start; FK for questions/guesses). */
  persistRoundId: string | null;
  /** VS_HUMANS: PICKING until the picker submits; VS_SYSTEM rounds start PLAYING. */
  phase: "PICKING" | "PLAYING";
  /** SECRET — server-side only, loaded once at PLAYING start; null while PICKING. */
  hidden: { ref: GpPlayerRef; pack: GpFactPack } | null;
  /** VS_HUMANS: the seat that picked (cannot ask or guess); null for VS_SYSTEM. */
  pickerSeat: number | null;
  /** Rotation of contestant SEAT numbers (picker excluded). */
  turnOrder: number[];
  turnIndex: number;
  turnNo: number; // monotonically increasing per answered question/guess
  questions: GpQuestionView[];
  /** Wrong guesses this round (public info — part of the shared board). */
  wrongGuesses: GpWrongGuessView[];
  guessesLeft: Map<number, number>; // seat → remaining attempts (3 at round start)
  roundDeadlineTs: number | null; // set when PLAYING begins
}

export type Timers = {
  turn?: ReturnType<typeof setTimeout>;
  pick?: ReturnType<typeof setTimeout>;
  round?: ReturnType<typeof setTimeout>;
  /** Reveal hold between rounds. */
  next?: ReturnType<typeof setTimeout>;
  /** Post-match play-again ready-vote window. */
  newMatch?: ReturnType<typeof setTimeout>;
  /** 30-min no-human-action idle close (final ruling #2). Reset on every
   *  player action; auto-advancing turn timers never reset it. */
  idle?: ReturnType<typeof setTimeout>;
};

export interface GpMatchRoom {
  id: string;
  /** Persistence identity for the CURRENT match (a replay gets a fresh one). */
  persistId: string;
  kind: "MANUAL" | "QUICK_PLAY";
  mode: GpMode;
  difficulty: GpDifficulty | null; // VS_SYSTEM only
  /** Rounds completed this SESSION (open-ended — no total). */
  roundsPlayed: number;
  /** VS_HUMANS: the picker for the NEXT round (correct guesser, or the same
   *  picker after a timeout), carried across the winner-screen countdown. */
  nextPickerSeat: number | null;
  roundTimerSec: number;
  turnTimerSec: number;
  inviteCode: string | null;
  roomName: string | null;
  maxPlayers: number;
  isPrivate: boolean;
  createdByUserId: string;
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  seats: GpSeat[];
  /** Hidden players already used this match (no repeats). */
  usedPlayerIds: Set<string>;
  round: ActiveGpRound | null;
  newMatch: { readySeats: Set<number>; deadlineTs: number } | null;
  deadlineTs: number | null; // current phase deadline (turn / pick)
  timers: Timers;
  persisted: boolean;
}
