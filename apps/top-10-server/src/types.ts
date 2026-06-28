import type { RoundState } from "@fb/top-10-engine";
import type { TtDifficulty, TtMatchKind } from "@fb/shared";
import type { CatalogEntry } from "./catalog.js";

export interface TtSeat {
  seat: number;
  userId: string;
  username: string;
  playerNumber: number;
  isBot: boolean;
  /** Bot skill ∈ [0,1] (bots only). */
  botSkill?: number;
  connected: boolean;
  socketId?: string;
  totalPoints: number; // accumulated across the match
  status: "ACTIVE" | "WITHDRAWN";
  /** Grace timer handle when a human socket drops (held, not removed). */
  graceTimer?: ReturnType<typeof setTimeout>;
}

export interface ActiveRound {
  roundNo: number;
  entry: CatalogEntry;
  state: RoundState;
  /** Current hint target's precomputed hint strings + which we've shown. */
  hintText: string | null;
  hintNumber: number;
  /** rank → the playerId actually revealed for it. For the cutoff rank (10) several
   *  players can be tied; this records WHICH tied player a contestant named, so the
   *  revealed card shows that player (not an arbitrary canonical one). Auto-reveals
   *  (hint exhaustion) leave it unset → the card falls back to the canonical player. */
  revealedPlayerByRank: Map<number, string>;
}

export type Timers = {
  turn?: ReturnType<typeof setTimeout>;
  hintCountdown?: ReturnType<typeof setTimeout>;
  hintWindow?: ReturnType<typeof setTimeout>;
  round?: ReturnType<typeof setTimeout>;
  bot?: ReturnType<typeof setTimeout>;
};

export interface MatchRoom {
  id: string;
  kind: TtMatchKind;
  difficulty: TtDifficulty;
  roundTimerSec: number;
  roundsTotal: number;
  inviteCode: string | null;
  /** Private manual rooms are never listed — joinable only by invite link/code. */
  isPrivate: boolean;
  createdByUserId: string;
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  seats: TtSeat[];
  usedEntryIds: Set<string>;
  round: ActiveRound | null;
  endRoundReq: { bySeat: number; approvals: Set<number> } | null;
  deadlineTs: number | null; // current phase deadline (turn / hint window)
  timers: Timers;
  persisted: boolean; // whether the TtMatch row exists yet
}
