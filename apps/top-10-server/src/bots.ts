import { randomUUID } from "node:crypto";
import { prisma } from "@fb/db";
import {
  decideHintAnswer,
  decideNormalTurn,
  skillForDifficulty,
  turnDelayMs,
} from "@fb/top-10-engine";
import { BOT_PLAYER_NUMBER_BASE, TT_BOTS, TT_TIMING } from "@fb/shared";
import type { BotHooks, Matches } from "./match.js";
import type { BotFiller } from "./socket.js";
import type { MatchRoom } from "./types.js";

/**
 * Top Ten quick-play bot fillers (cold-start, removable; mirrors Link Up's bots).
 * Identities = the SAME reserved `player_number ≥ 900000` user rows in
 * platform.users that Link Up seeds — a bot is a platform fact. Decisions come from
 * the pure @fb/top-10-engine bot model. Bots play ONLY in quick-play and never get
 * progression/XP (enforced in persistence). Behind BOTS_ENABLED on the server.
 */
export interface BotIdentity {
  userId: string;
  username: string;
  playerNumber: number;
}

export async function loadBotPool(): Promise<BotIdentity[]> {
  const rows = await prisma.user.findMany({
    where: { playerNumber: { gte: BOT_PLAYER_NUMBER_BASE } },
    select: { id: true, username: true, nickname: true, playerNumber: true },
    orderBy: { playerNumber: "asc" },
  });
  // A bot is seated under its human-looking NICKNAME (never the bot_<n> username) so an
  // opponent can't tell it's a bot. userId stays the real identity key.
  return rows.map((r) => ({ userId: r.id, username: r.nickname?.trim() || r.username, playerNumber: r.playerNumber }));
}

export class TopTenBots {
  /** Active per-room bot timers, cleared on cancel/round-end. */
  private timers = new Map<string, Set<ReturnType<typeof setTimeout>>>();

  constructor(private pool: BotIdentity[]) {}

  private track(roomId: string, t: ReturnType<typeof setTimeout>): void {
    (this.timers.get(roomId) ?? this.timers.set(roomId, new Set()).get(roomId)!).add(t);
  }

  hooks(): BotHooks {
    return {
      onNormalTurn: (ctl, room, seat) => this.onNormalTurn(ctl, room, seat),
      onHintOpen: (ctl, room) => this.onHintOpen(ctl, room),
      cancel: (room) => this.cancel(room),
      fillOne: (matches, room) => this.fillOne(matches, room),
    };
  }

  /** Seat ONE fresh bot (mid-round substitution for a withdrawing human). Picks a
   *  random pool identity not already at the table and returns its new seat number, or
   *  null if none is available / the room is full. */
  fillOne(matches: Matches, room: MatchRoom): number | null {
    if (this.pool.length === 0) return null;
    const seatedIds = new Set(room.seats.map((s) => s.userId));
    const available = this.pool.filter((b) => !seatedIds.has(b.userId));
    if (available.length === 0) return null;
    const identity = available[Math.floor(Math.random() * available.length)]!;
    const skill = skillForDifficulty(room.difficulty, Math.random);
    const seat = matches.addSeat(room, identity, true, skill);
    return seat ? seat.seat : null;
  }

  filler(): BotFiller {
    return { fillQuickPlay: (matches, room) => this.fillQuickPlay(matches, room) };
  }

  cancel(room: MatchRoom): void {
    const set = this.timers.get(room.id);
    if (set) {
      for (const t of set) clearTimeout(t);
      set.clear();
    }
  }

  fillQuickPlay(matches: Matches, room: MatchRoom): void {
    if (this.pool.length === 0) return;
    const humans = room.seats.length;
    const targetMin = Math.max(TT_BOTS.fillMinSeats, humans, 2);
    const target = Math.min(TT_BOTS.fillMaxSeats, Math.max(targetMin, randInt(TT_BOTS.fillMinSeats, TT_BOTS.fillMaxSeats)));
    const seatedIds = new Set(room.seats.map((s) => s.userId));
    const available = this.pool.filter((b) => !seatedIds.has(b.userId));
    shuffle(available);
    let i = 0;
    while (room.seats.length < target && i < available.length) {
      const skill = skillForDifficulty(room.difficulty, Math.random);
      matches.addSeat(room, available[i]!, true, skill);
      i++;
    }
  }

  private onNormalTurn(ctl: Matches, room: MatchRoom, seat: number): void {
    const seatObj = room.seats.find((s) => s.seat === seat);
    if (!seatObj?.isBot) return;
    const skill = seatObj.botSkill ?? 0.5;
    const delay = turnDelayMs(skill, Math.random);
    const t = setTimeout(() => {
      const r = room.round;
      if (!r || r.state.mode !== "NORMAL") return;
      const decision = decideNormalTurn(r.state.hidden, skill, Math.random);
      if (decision.kind === "guessCorrect") {
        // any accepted (tied) player at that rank clears it — pick one to name
        const cp = r.entry.players.find((p) => p.rank === decision.rank);
        ctl.guess(room, seat, cp ? cp.playerId : randomUUID());
      } else {
        ctl.guess(room, seat, randomUUID()); // a wrong (out-of-top-10) pick
      }
    }, delay);
    this.track(room.id, t);
  }

  private onHintOpen(ctl: Matches, room: MatchRoom): void {
    const r = room.round;
    if (!r || r.state.mode !== "HINT") return;
    for (const seatObj of room.seats) {
      if (!seatObj.isBot || seatObj.status !== "ACTIVE") continue;
      if (r.state.lockedSeats.includes(seatObj.seat)) continue;
      const skill = seatObj.botSkill ?? 0.5;
      const decision = decideHintAnswer(r.state.hidden, skill, Math.random, TT_TIMING.hintAnswerSec);
      const t = setTimeout(() => {
        const rr = room.round;
        if (!rr || rr.state.mode !== "HINT" || !rr.state.hint || rr.state.hint.phase !== "OPEN") return;
        if (rr.state.lockedSeats.includes(seatObj.seat)) return;
        if (decision.correct && decision.rank != null) {
          const cp = rr.entry.players.find((p) => p.rank === decision.rank);
          ctl.guess(room, seatObj.seat, cp ? cp.playerId : randomUUID());
        } else {
          ctl.guess(room, seatObj.seat, randomUUID());
        }
      }, decision.reactionMs);
      this.track(room.id, t);
    }
  }
}

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
function shuffle<T>(a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
}
