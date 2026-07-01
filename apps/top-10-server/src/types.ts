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
  /** Anti-cheat presence: switched away from the table (tab hidden) without leaving.
   *  Transient — cleared on return / reconnect. Never persisted. */
  away?: boolean;
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
  /** rank → the playerId actually named for it. A rank may have several accepted
   *  (tied) players; this records which one a contestant named so the revealed card
   *  shows that player. Auto-reveals (hint exhaustion) fall back to a tied player. */
  revealedPlayerByRank: Map<number, string>;
}

export type Timers = {
  turn?: ReturnType<typeof setTimeout>;
  hintCountdown?: ReturnType<typeof setTimeout>;
  hintWindow?: ReturnType<typeof setTimeout>;
  round?: ReturnType<typeof setTimeout>;
  bot?: ReturnType<typeof setTimeout>;
  /** Auto-start countdown for the post-round New-Round ready vote. */
  newRound?: ReturnType<typeof setTimeout>;
  /** Celebratory hold on the fully-revealed board before the winner screen. */
  finish?: ReturnType<typeof setTimeout>;
};

export interface MatchRoom {
  id: string;
  /** Persistence identity for the CURRENT round-match. The socket room keeps `id`
   *  for its lifetime; each replayed round gets a fresh `persistId` so its DB rows
   *  (match, players, reveals, XP references) never collide with a prior round. */
  persistId: string;
  kind: TtMatchKind;
  difficulty: TtDifficulty;
  roundTimerSec: number;
  roundsTotal: number;
  inviteCode: string | null;
  /** Optional display name (manual rooms); null for quick play. */
  roomName: string | null;
  /** Seat cap for this room (manual rooms set it; quick play uses the max). */
  maxPlayers: number;
  /** Private manual rooms are never listed — joinable only by invite link/code. */
  isPrivate: boolean;
  createdByUserId: string;
  status: "LOBBY" | "IN_PROGRESS" | "ENDED" | "ABANDONED";
  seats: TtSeat[];
  usedEntryIds: Set<string>;
  round: ActiveRound | null;
  endRoundReq: { bySeat: number; approvals: Set<number> } | null;
  /** Post-round New-Round ready vote (status ENDED). Null otherwise. */
  newRound: { readySeats: Set<number>; deadlineTs: number } | null;
  deadlineTs: number | null; // current phase deadline (turn / hint window)
  timers: Timers;
  persisted: boolean; // whether the TtMatch row exists yet
}
