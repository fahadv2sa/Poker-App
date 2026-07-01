/**
 * Top Ten — WebSocket event contracts. Client→server inputs are validated with Zod
 * (every input); server→client payloads are typed. The server broadcasts a full
 * sanitized match snapshot (`tt:state`) on every change — the hint TARGET identity is
 * never sent until its card is revealed. Mirrors Link Up's ws.ts pattern.
 */
import { z } from "zod";
import {
  TT_DIFFICULTIES,
  TT_MAX_PLAYERS,
  TT_MIN_PLAYERS,
  TT_QUESTION_TYPES,
  TT_ROUND_END_REASONS,
  TT_ROUND_MODES,
} from "./top10.js";

export const TT_CLIENT_EVENTS = {
  create: "tt:create",
  join: "tt:join",
  leave: "tt:leave",
  close: "tt:close",
  start: "tt:start",
  guess: "tt:guess",
  endRoundRequest: "tt:endRoundRequest",
  endRoundVote: "tt:endRoundVote",
  /** Ready up for a new round at the same table after a round ends. */
  newRound: "tt:newRound",
  queueJoin: "tt:queueJoin",
  queueLeave: "tt:queueLeave",
} as const;

export const TT_SERVER_EVENTS = {
  state: "tt:state",
  matchStarted: "tt:matchStarted",
  reveal: "tt:reveal",
  roundEnded: "tt:roundEnded",
  matchEnded: "tt:matchEnded",
  endRoundRequested: "tt:endRoundRequested",
  queueState: "tt:queueState",
  queueMatched: "tt:queueMatched",
  toast: "tt:toast",
  error: "tt:error",
  /** The creator closed the table (from the winner screen): every player is returned
   *  to the lobby with a notice. Carries an optional Arabic reason for the toast. */
  tableClosed: "tt:tableClosed",
} as const;

// ---- client → server (validated) -------------------------------------------

export const ttDifficultySchema = z.enum(TT_DIFFICULTIES);

export const ttCreateSchema = z.object({
  difficulty: ttDifficultySchema,
  /** Optional display name for the room (shown in the lobby + the rooms list). */
  roomName: z.string().trim().min(2, "اسم الغرفة قصير جدًا").max(40).optional(),
  /** Seat cap for the room (manual rooms only); defaults to TT_MAX_PLAYERS. */
  maxPlayers: z.number().int().min(TT_MIN_PLAYERS).max(TT_MAX_PLAYERS).optional(),
  /** Round timer in seconds — customizable in CREATED rooms only. */
  roundTimerSec: z.number().int().min(60).max(1800).optional(),
  /** Private rooms are NEVER listed — reachable only via invite link / room code. */
  isPrivate: z.boolean().optional(),
});
export type TtCreateInput = z.infer<typeof ttCreateSchema>;

export const ttJoinSchema = z.object({ inviteCode: z.string().trim().min(1) });
export type TtJoinInput = z.infer<typeof ttJoinSchema>;

export const ttGuessSchema = z.object({ playerId: z.string().uuid() });
export type TtGuessInput = z.infer<typeof ttGuessSchema>;

export const ttEndRoundVoteSchema = z.object({ accept: z.boolean() });
export type TtEndRoundVoteInput = z.infer<typeof ttEndRoundVoteSchema>;

export const ttQueueJoinSchema = z.object({ difficulty: ttDifficultySchema });
export type TtQueueJoinInput = z.infer<typeof ttQueueJoinSchema>;

// ---- server → client (typed) -----------------------------------------------

export type TtCardView = {
  /** Fixed rank slot 1..10 (ranks never move; a tie is just several accepted names). */
  rank: number;
  revealed: boolean;
  /** Present only once revealed — the player actually named for this rank. `photoUrl`
   *  lets the revealed card become the player's photo (null → initials fallback). */
  player: { id: string; name: string; nameAr: string; value: number; photoUrl: string | null } | null;
  bySeat: number | null;
};

export type TtSeatView = {
  seat: number;
  userId: string;
  username: string;
  playerNumber: number;
  isBot: boolean;
  connected: boolean;
  totalPoints: number;
  roundPoints: number;
  status: "ACTIVE" | "WITHDRAWN";
  /** Hint mode: wrong attempts used + whether locked out this round. */
  wrongAttempts: number;
  locked: boolean;
};

export type TtStateView = {
  matchId: string;
  kind: "MANUAL" | "QUICK_PLAY";
  inviteCode: string | null;
  /** Optional display name (manual rooms); null for quick play. */
  roomName: string | null;
  /** Seat cap for this room. */
  maxPlayers: number;
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  difficulty: (typeof TT_DIFFICULTIES)[number];
  createdByUserId: string;
  roundTimerSec: number;
  roundNo: number; // 1..3 (0 in lobby)
  roundsTotal: number;
  mode: (typeof TT_ROUND_MODES)[number];
  question: { type: (typeof TT_QUESTION_TYPES)[number]; titleAr: string; competitionAr: string; season: number } | null;
  cards: TtCardView[];
  seats: TtSeatView[];
  /** Whose turn (NORMAL mode), seat number, with the absolute deadline. */
  turnSeat: number | null;
  deadlineTs: number | null;
  /** Hint mode public view: the active hint text + phase + which RANK it's for (never
   *  the target player's identity until that card is revealed). */
  hint: { phase: "COUNTDOWN" | "OPEN"; text: string | null; hintNumber: number; rank: number } | null;
  /** Pending end-round request: who asked + who still needs to approve. */
  endRoundRequest: { bySeat: number; approvals: number[]; needed: number } | null;
  /** After a round ends (status ENDED): the New-Round ready vote — which seats are
   *  ready, how many connected humans are needed, and the auto-start countdown
   *  deadline. Null while a round is live or in the lobby. */
  newRoundRequest: { readySeats: number[]; needed: number; deadlineTs: number | null } | null;
};

export type TtRevealEvent = {
  rank: number;
  bySeat: number | null;
  points: number;
  player: { id: string; name: string; nameAr: string; value: number; photoUrl: string | null };
};

export type TtStandingRow = {
  userId: string;
  username: string;
  seat: number;
  points: number;
  place: number;
  tiedWithPrev: boolean;
  xpAwarded?: number;
};

export type TtRoundEndedEvent = {
  reason: (typeof TT_ROUND_END_REASONS)[number];
  roundNo: number;
  standings: TtStandingRow[];
};

export type TtMatchEndedEvent = {
  standings: TtStandingRow[];
  /** The final revealed board (rank + who revealed each), for the winner-announcement
   *  per-player breakdown. Empty when a match ends before any reveal. */
  cards?: TtCardView[];
};

export type TtQueueStateEvent = {
  difficulty: (typeof TT_DIFFICULTIES)[number];
  waiting: number;
  needed: number;
  countdownSec: number | null;
};
