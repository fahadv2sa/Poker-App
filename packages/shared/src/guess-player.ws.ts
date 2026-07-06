/**
 * Guess the Player — WebSocket event contracts. Client→server inputs are
 * validated with Zod (every input); server→client payloads are typed. The
 * server broadcasts a full sanitized snapshot (`gp:state`) on every change.
 *
 * SECRECY INVARIANT: the hidden player's identity NEVER appears in any
 * payload before `gp:reveal` — with ONE exception: in VS_HUMANS the picker's
 * own socket receives the pick echo (they chose it). Questions are never
 * free text on the wire: a template + entity ids selected via autocomplete
 * (the Top Ten search pattern), so nothing is parsed and the forbidden
 * topics (position/appearance) simply have no template.
 */
import { z } from "zod";
import {
  GP_DIFFICULTIES,
  GP_LIMITS,
  GP_MODES,
  GP_QUESTION_TEMPLATES,
  GP_ROUND_END_REASONS,
} from "./guess-player.js";

export const GP_CLIENT_EVENTS = {
  create: "gp:create",
  join: "gp:join",
  leave: "gp:leave",
  close: "gp:close",
  start: "gp:start",
  /** VS_HUMANS: the picker submits the hidden player (full-DB search → id). */
  pick: "gp:pick",
  /** Ask one structured question (consumes the turn unless answered UNKNOWN). */
  ask: "gp:ask",
  /** Spend one of the 3 guess attempts on a searched player id. */
  guess: "gp:guess",
  /** Ready up to play the match again at the same table. */
  newMatch: "gp:newMatch",
  queueJoin: "gp:queueJoin",
  queueLeave: "gp:queueLeave",
  away: "gp:away",
  back: "gp:back",
} as const;

export const GP_SERVER_EVENTS = {
  state: "gp:state",
  matchStarted: "gp:matchStarted",
  /** One answered question appended to the shared board. */
  question: "gp:question",
  /** A wrong guess (public: the named player is information for everyone). */
  wrongGuess: "gp:wrongGuess",
  /** Round over: the hidden player is revealed with the outcome. */
  reveal: "gp:reveal",
  roundEnded: "gp:roundEnded",
  matchEnded: "gp:matchEnded",
  /** VS_HUMANS: private echo to the picker of the player they picked. */
  pickConfirmed: "gp:pickConfirmed",
  queueState: "gp:queueState",
  queueMatched: "gp:queueMatched",
  toast: "gp:toast",
  error: "gp:error",
  tableClosed: "gp:tableClosed",
  awayNotice: "gp:awayNotice",
} as const;

// ---- client → server (validated) -------------------------------------------

export const gpDifficultySchema = z.enum(GP_DIFFICULTIES);
export const gpModeSchema = z.enum(GP_MODES);

export const gpCreateSchema = z
  .object({
    mode: gpModeSchema,
    /** Required for VS_SYSTEM; must be absent for VS_HUMANS (no tiers there). */
    difficulty: gpDifficultySchema.optional(),
    roomName: z.string().trim().min(2, "اسم الغرفة قصير جدًا").max(40).optional(),
    maxPlayers: z.number().int().min(GP_LIMITS.minPlayers).max(GP_LIMITS.maxPlayers).optional(),
    isPrivate: z.boolean().optional(),
    /** One-time id minted by the create-room form and carried in the deep-link
     *  URL. Reloading /play?create=1 re-sends the SAME nonce → the server
     *  resyncs the room that nonce already created (no duplicate); a fresh
     *  form submit mints a NEW nonce → any stale held seat is withdrawn and a
     *  fresh lobby opens (fixes create dropping into an old live table). */
    nonce: z.string().trim().min(1).max(32).optional(),
  })
  .refine((v) => (v.mode === "VS_SYSTEM" ? v.difficulty != null : v.difficulty == null), {
    message: "difficulty is required for VS_SYSTEM and forbidden for VS_HUMANS",
  });
export type GpCreateInput = z.infer<typeof gpCreateSchema>;

export const gpJoinSchema = z.object({ inviteCode: z.string().trim().min(1) });

export const gpPickSchema = z.object({ playerId: z.string().uuid() });

/** The 9 templates — a discriminated union, one shape per template. Entities
 *  are IDS (or canonical names for countries / trophy_dim identities); the
 *  server re-validates every entity against the reference data before
 *  answering. Season = API start year. */
const seasonField = z.number().int().min(1950).max(2035);
const countryField = z.string().trim().min(2).max(60);
export const gpAskSchema = z.discriminatedUnion("template", [
  z.object({ template: z.literal("CLUB_EVER"), clubId: z.string().uuid() }),
  z.object({ template: z.literal("CLUB_SEASON"), clubId: z.string().uuid(), season: seasonField }),
  z.object({ template: z.literal("NATIONALITY"), countryName: countryField }),
  z.object({ template: z.literal("NATIONAL_TEAM"), countryName: countryField }),
  z.object({ template: z.literal("COMPETITION_EVER"), leagueId: z.number().int().positive() }),
  z.object({
    template: z.literal("COMPETITION_SEASON"),
    leagueId: z.number().int().positive(),
    season: seasonField,
  }),
  z.object({
    template: z.literal("TROPHY_EVER"),
    compName: z.string().trim().min(1).max(80),
    country: z.string().trim().max(60),
  }),
  z.object({
    template: z.literal("TROPHY_SEASON"),
    compName: z.string().trim().min(1).max(80),
    country: z.string().trim().max(60),
    season: seasonField,
  }),
  z.object({
    template: z.literal("TROPHY_WITH_CLUB"),
    compName: z.string().trim().min(1).max(80),
    country: z.string().trim().max(60),
    clubId: z.string().uuid(),
  }),
]);
export type GpAskInput = z.infer<typeof gpAskSchema>;

export const gpGuessSchema = z.object({ playerId: z.string().uuid() });
export const gpQueueJoinSchema = z.object({ difficulty: gpDifficultySchema });

// ---- server → client (typed) -----------------------------------------------

export type GpAnswerView = "YES" | "NO" | "UNKNOWN";

/** One answered question on the shared board. `params` carries the resolved
 *  display labels frozen at ask time (e.g. { clubName: "Liverpool" }) so the
 *  client renders the Arabic sentence without further lookups. */
export type GpQuestionView = {
  turnNo: number;
  seat: number;
  template: (typeof GP_QUESTION_TEMPLATES)[number];
  params: Record<string, string | number>;
  answer: GpAnswerView;
};

export type GpWrongGuessView = {
  seat: number;
  /** Public info: which player was (wrongly) named. */
  player: { id: string; name: string; nameAr: string | null };
  attemptsLeft: number;
};

export type GpSeatView = {
  seat: number;
  userId: string;
  username: string;
  playerNumber: number;
  connected: boolean;
  totalPoints: number;
  status: "ACTIVE" | "WITHDRAWN";
  guessesLeft: number;
  /** VS_HUMANS: this seat is the current round's picker (cannot ask/guess). */
  isPicker: boolean;
  away: boolean;
};

export type GpStateView = {
  matchId: string;
  kind: "MANUAL" | "QUICK_PLAY";
  mode: (typeof GP_MODES)[number];
  inviteCode: string | null;
  roomName: string | null;
  maxPlayers: number;
  isPrivate: boolean;
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  difficulty: (typeof GP_DIFFICULTIES)[number] | null;
  createdByUserId: string;
  /** Session round counter (1, 2, 3…) — rounds are open-ended, no total. */
  roundNo: number;
  /** VS_HUMANS: PICKING while the picker chooses; PLAYING once questions run. */
  phase: "PICKING" | "PLAYING" | null;
  seats: GpSeatView[];
  questions: GpQuestionView[];
  /** Wrong guesses this round (public — the named player is information). */
  wrongGuesses: GpWrongGuessView[];
  turnSeat: number | null;
  /** Current phase deadline (turn / pick), absolute ms. */
  deadlineTs: number | null;
  /** Round deadline (10-min clock), absolute ms; null between rounds. */
  roundDeadlineTs: number | null;
  newMatchRequest: { readySeats: number[]; needed: number; deadlineTs: number | null } | null;
};

export type GpRevealEvent = {
  roundNo: number;
  reason: (typeof GP_ROUND_END_REASONS)[number];
  /** The hidden player, revealed. */
  player: { id: string; name: string; nameAr: string | null; photoUrl: string | null };
  winnerSeat: number | null;
  winnerPoints: number;
  /** VS_HUMANS extras: picker's cut of a solved round / survival bonus. */
  pickerSeat: number | null;
  pickerPoints: number;
};

export type GpStandingRow = {
  userId: string;
  username: string;
  seat: number;
  points: number;
  place: number;
  tiedWithPrev: boolean;
};

export type GpQueueStateEvent = {
  difficulty: (typeof GP_DIFFICULTIES)[number];
  waiting: number;
  needed: number;
  countdownSec: number | null;
};
