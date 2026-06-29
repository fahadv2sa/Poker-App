import {
  beginHintCard,
  currentTurnSeat,
  endRound,
  finalStandings,
  hintGuess,
  hintWindowTimeout,
  initRound,
  matchWinBonus,
  normalGuess,
  normalTimeout,
  revealedRanksBySeat,
  revealHint,
  roundXp,
  scoreBySeat,
  type Outcome,
  type RoundEvent,
  type RoundState,
} from "@fb/top-10-engine";
import {
  TT_HINT,
  TT_MAX_PLAYERS,
  TT_MIN_PLAYERS,
  TT_ROUNDS_PER_MATCH,
  TT_SERVER_EVENTS,
  TT_TIMING,
  type TtMatchKind,
  type TtDifficulty,
  type TtStandingRow,
  type TtStateView,
} from "@fb/shared";
import type { CatalogEntry, CatalogSource } from "./catalog.js";
import type { MatchRoom, TtSeat } from "./types.js";
import type { TtPersistence } from "./persistence.js";

export interface BotHooks {
  onNormalTurn(ctl: Matches, room: MatchRoom, seat: number): void;
  onHintOpen(ctl: Matches, room: MatchRoom): void;
  cancel(room: MatchRoom): void;
}

export interface MatchDeps {
  catalog: CatalogSource;
  persist: TtPersistence;
  emit: (matchId: string, event: string, payload: unknown) => void;
  rng?: () => number;
  bots?: BotHooks;
}

let inviteSeq = Math.floor(Math.random() * 9000) + 1000;
const nextInvite = () => `T${inviteSeq++}`;

export class Matches {
  private rooms = new Map<string, MatchRoom>();
  constructor(private deps: MatchDeps) {}

  private rng() {
    return (this.deps.rng ?? Math.random)();
  }

  get(matchId: string): MatchRoom | undefined {
    return this.rooms.get(matchId);
  }
  list(): MatchRoom[] {
    return [...this.rooms.values()];
  }

  // ---- lifecycle ----------------------------------------------------------

  createManual(
    creator: { userId: string; username: string; playerNumber: number },
    difficulty: TtDifficulty,
    roundTimerSec: number,
    isPrivate = false,
    roomName: string | null = null,
    maxPlayers: number = TT_MAX_PLAYERS,
  ): MatchRoom {
    const id = cryptoRandomId();
    const room: MatchRoom = {
      id,
      kind: "MANUAL",
      difficulty,
      roundTimerSec,
      roundsTotal: TT_ROUNDS_PER_MATCH,
      inviteCode: nextInvite(),
      roomName: roomName?.trim() || null,
      maxPlayers: clampSeats(maxPlayers),
      isPrivate,
      createdByUserId: creator.userId,
      status: "LOBBY",
      seats: [],
      usedEntryIds: new Set(),
      round: null,
      endRoundReq: null,
      deadlineTs: null,
      timers: {},
      persisted: false,
    };
    this.rooms.set(id, room);
    this.addSeat(room, creator, false);
    return room;
  }

  createQuickPlay(difficulty: TtDifficulty): MatchRoom {
    const id = cryptoRandomId();
    const room: MatchRoom = {
      id,
      kind: "QUICK_PLAY" as TtMatchKind,
      difficulty,
      roundTimerSec: TT_TIMING.defaultRoundSec,
      roundsTotal: TT_ROUNDS_PER_MATCH,
      inviteCode: null,
      roomName: null,
      maxPlayers: TT_MAX_PLAYERS,
      isPrivate: false,
      createdByUserId: "",
      status: "LOBBY",
      seats: [],
      usedEntryIds: new Set(),
      round: null,
      endRoundReq: null,
      deadlineTs: null,
      timers: {},
      persisted: false,
    };
    this.rooms.set(id, room);
    return room;
  }

  addSeat(
    room: MatchRoom,
    user: { userId: string; username: string; playerNumber: number },
    isBot: boolean,
    botSkill?: number,
  ): TtSeat | null {
    if (room.seats.length >= room.maxPlayers) return null;
    const existing = room.seats.find((s) => s.userId === user.userId);
    if (existing) {
      existing.connected = true;
      return existing;
    }
    const seat: TtSeat = {
      seat: nextFreeSeat(room),
      userId: user.userId,
      username: user.username,
      playerNumber: user.playerNumber,
      isBot,
      botSkill,
      connected: true,
      totalPoints: 0,
      status: "ACTIVE",
    };
    room.seats.push(seat);
    room.seats.sort((a, b) => a.seat - b.seat);
    return seat;
  }

  start(room: MatchRoom, byUserId: string): { ok: boolean; error?: string } {
    if (room.status !== "LOBBY") return { ok: false, error: "ALREADY_STARTED" };
    if (room.kind === "MANUAL" && room.createdByUserId !== byUserId)
      return { ok: false, error: "NOT_CREATOR" };
    if (activeSeats(room).length < TT_MIN_PLAYERS) return { ok: false, error: "NOT_ENOUGH_PLAYERS" };
    room.status = "IN_PROGRESS";
    void this.deps.persist.createMatch(room).then(() => (room.persisted = true)).catch(() => {});
    this.deps.emit(room.id, TT_SERVER_EVENTS.matchStarted, { matchId: room.id });
    this.startRound(room, 1);
    return { ok: true };
  }

  private startRound(room: MatchRoom, roundNo: number): void {
    const entry = this.deps.catalog.pick(room.difficulty, room.usedEntryIds, () => this.rng());
    if (!entry) {
      // No question available — end the match gracefully.
      this.finishMatch(room);
      return;
    }
    room.usedEntryIds.add(entry.id);
    const seats = activeSeats(room).map((s) => s.seat);
    const startIndex = (roundNo - 1) % seats.length; // rotate the starting player each round
    const state = initRound(seats, startIndex);
    room.round = { roundNo, entry, state, hintText: null, hintNumber: 0, revealedPlayerByRank: new Map() };
    room.endRoundReq = null;
    // overall round timer (10 min default, customizable in created rooms)
    this.clear(room, "round");
    room.timers.round = setTimeout(() => this.onRoundTimer(room), room.roundTimerSec * 1000);
    this.beginTurn(room);
  }

  // ---- normal turn mode ---------------------------------------------------

  private beginTurn(room: MatchRoom): void {
    const r = room.round;
    if (!r || r.state.mode !== "NORMAL") return;
    const seat = currentTurnSeat(r.state);
    if (seat == null) return;
    this.clear(room, "turn");
    room.deadlineTs = Date.now() + TT_TIMING.turnSec * 1000;
    room.timers.turn = setTimeout(() => this.onTurnTimeout(room, seat), TT_TIMING.turnSec * 1000);
    this.sync(room);
    const seatObj = room.seats.find((s) => s.seat === seat);
    if (seatObj?.isBot) this.deps.bots?.onNormalTurn(this, room, seat);
  }

  private onTurnTimeout(room: MatchRoom, seat: number): void {
    const r = room.round;
    if (!r || r.state.mode !== "NORMAL" || currentTurnSeat(r.state) !== seat) return;
    const { state, events } = normalTimeout(r.state, seat);
    r.state = state;
    this.afterRoundStep(room, events);
  }

  // ---- guesses (both modes) ----------------------------------------------

  /** A player (or bot) selected `playerId`. The server resolves it to a rank: naming
   *  ANY accepted (tied) player at a still-hidden rank reveals it; any other tied
   *  player at that rank then resolves to "already" (cancelled). */
  guess(room: MatchRoom, seat: number, playerId: string): void {
    const r = room.round;
    if (!r || room.status !== "IN_PROGRESS") return;
    const outcome = resolveOutcome(r.entry, r.state, playerId);
    const step = r.state.mode === "NORMAL" ? normalGuess(r.state, seat, outcome) : hintGuess(r.state, seat, outcome);
    r.state = step.state;
    // Record WHICH tied player was named for the revealed rank, so the card shows them.
    if (outcome.type === "correct" && step.events.some((e) => e.t === "reveal" && e.bySeat === seat)) {
      r.revealedPlayerByRank.set(outcome.rank, playerId);
    }
    this.afterRoundStep(room, step.events);
  }

  /** The player to DISPLAY for a revealed rank: the one actually named, else a
   *  (canonical) accepted player at that rank — used for auto-reveals (hint exhaustion). */
  private revealedPlayer(r: { entry: CatalogEntry; revealedPlayerByRank: Map<number, string> }, rank: number) {
    const pid = r.revealedPlayerByRank.get(rank);
    return (pid && r.entry.players.find((p) => p.playerId === pid)) || r.entry.players.find((p) => p.rank === rank);
  }

  /** Interpret engine events: broadcast reveals, (re)schedule timers, advance. */
  private afterRoundStep(room: MatchRoom, events: RoundEvent[]): void {
    const r = room.round;
    if (!r) return;
    let modeSwitched = false;
    let roundEnded = false;
    for (const e of events) {
      if (e.t === "reveal") {
        const cp = this.revealedPlayer(r, e.rank)!;
        this.deps.emit(room.id, TT_SERVER_EVENTS.reveal, {
          rank: e.rank,
          bySeat: e.bySeat,
          points: e.points,
          player: { id: cp.playerId, name: cp.name, nameAr: cp.nameAr, value: cp.value, photoUrl: cp.photoUrl },
        });
      } else if (e.t === "seatLocked") {
        // surfaced via state sync
      } else if (e.t === "modeSwitched") {
        modeSwitched = true;
      } else if (e.t === "roundEnded") {
        roundEnded = true;
      }
    }

    if (roundEnded) {
      this.finishRound(room, r.state.endReason ?? "ALL_REVEALED");
      return;
    }
    if (modeSwitched) {
      this.deps.bots?.cancel(room);
      this.beginNextHintCard(room);
      return;
    }
    if (r.state.mode === "NORMAL") {
      this.beginTurn(room);
    } else {
      // still in an OPEN hint window (a different card was revealed) or target solved
      if (r.state.hint == null) this.beginNextHintCard(room);
      else this.sync(room);
    }
  }

  // ---- hint / fastest-answer mode -----------------------------------------

  private beginNextHintCard(room: MatchRoom): void {
    const r = room.round;
    if (!r) return;
    if (r.state.hidden.length === 0) {
      this.finishRound(room, "ALL_REVEALED");
      return;
    }
    // choose a target: the most valuable hidden rank (highest rank number)
    const targetRank = Math.max(...r.state.hidden);
    const { state } = beginHintCard(r.state, targetRank);
    r.state = state;
    r.hintNumber = 0;
    r.hintText = null;
    // 10 → 0 countdown with inputs LOCKED
    this.clear(room, "turn", "hintWindow", "hintCountdown");
    room.deadlineTs = Date.now() + TT_TIMING.hintCountdownSec * 1000;
    room.timers.hintCountdown = setTimeout(() => this.onHintCountdownEnd(room), TT_TIMING.hintCountdownSec * 1000);
    this.sync(room);
  }

  private onHintCountdownEnd(room: MatchRoom): void {
    const r = room.round;
    if (!r || r.state.mode !== "HINT" || !r.state.hint) return;
    this.openHintWindow(room);
  }

  private openHintWindow(room: MatchRoom): void {
    const r = room.round;
    if (!r || !r.state.hint) return;
    const { state } = revealHint(r.state);
    r.state = state;
    const target = r.entry.players.find((p) => p.rank === state.hint!.targetRank)!;
    r.hintNumber = state.hint!.hintsGiven;
    r.hintText = target.hints[Math.min(r.hintNumber - 1, target.hints.length - 1)] ?? "تلميح";
    this.clear(room, "hintWindow");
    room.deadlineTs = Date.now() + TT_TIMING.hintAnswerSec * 1000;
    room.timers.hintWindow = setTimeout(() => this.onHintWindowEnd(room), TT_TIMING.hintAnswerSec * 1000);
    this.sync(room);
    this.deps.bots?.onHintOpen(this, room);
  }

  private onHintWindowEnd(room: MatchRoom): void {
    const r = room.round;
    if (!r || r.state.mode !== "HINT" || !r.state.hint) return;
    const hadHints = r.state.hint.hintsGiven;
    const { state, events } = hintWindowTimeout(r.state);
    r.state = state;
    // auto-reveal emits a reveal event
    for (const e of events) {
      if (e.t === "reveal") {
        const cp = this.revealedPlayer(r, e.rank)!;
        this.deps.emit(room.id, TT_SERVER_EVENTS.reveal, {
          rank: e.rank, bySeat: null, points: 0,
          player: { id: cp.playerId, name: cp.name, nameAr: cp.nameAr, value: cp.value, photoUrl: cp.photoUrl },
        });
      } else if (e.t === "roundEnded") {
        this.finishRound(room, state.endReason ?? "ALL_REVEALED");
        return;
      }
    }
    if (r.state.hint == null) {
      this.beginNextHintCard(room);
    } else if (hadHints < TT_HINT.maxHintsPerCard) {
      // a new hint for the SAME card, fresh 30s window (no extra countdown lock)
      this.openHintWindow(room);
    }
  }

  // ---- end-round request (unanimous) --------------------------------------

  requestEndRound(room: MatchRoom, seat: number): void {
    if (!room.round || room.status !== "IN_PROGRESS") return;
    room.endRoundReq = { bySeat: seat, approvals: new Set([seat]) };
    this.deps.emit(room.id, TT_SERVER_EVENTS.endRoundRequested, { bySeat: seat });
    this.maybeResolveEndRound(room);
  }

  voteEndRound(room: MatchRoom, seat: number, accept: boolean): void {
    if (!room.endRoundReq) return;
    if (!accept) {
      room.endRoundReq = null;
      this.sync(room);
      return;
    }
    room.endRoundReq.approvals.add(seat);
    this.maybeResolveEndRound(room);
  }

  private maybeResolveEndRound(room: MatchRoom): void {
    const req = room.endRoundReq;
    if (!req) return;
    const humans = activeSeats(room);
    const allApproved = humans.every((s) => req.approvals.has(s.seat) || s.isBot);
    if (allApproved) {
      room.endRoundReq = null;
      this.finishRound(room, "UNANIMOUS_END");
    } else {
      this.sync(room);
    }
  }

  private onRoundTimer(room: MatchRoom): void {
    if (room.round && room.status === "IN_PROGRESS") this.finishRound(room, "TIMER");
  }

  /** The room creator closes the table for EVERYONE (mirrors Link Up's host close):
   *  ends the match, notifies all seats, and tears the room down. Only the creator may. */
  closeRoom(room: MatchRoom, byUserId: string): void {
    if (room.createdByUserId !== byUserId) return;
    if (room.status === "ENDED" || room.status === "ABANDONED") return;
    this.deps.emit(room.id, TT_SERVER_EVENTS.toast, { text: "أُغلقت الطاولة" });
    if (room.status === "LOBBY") {
      // nothing played yet → just evict + drop the room
      this.deps.emit(room.id, TT_SERVER_EVENTS.matchEnded, { standings: this.standings(room) });
      this.removeRoom(room.id);
      return;
    }
    this.finishMatch(room, true);
  }

  // ---- withdrawal ---------------------------------------------------------

  /** A player leaves (explicit) or their grace expires. During a match this is a
   *  withdrawal: they lose ALL accumulated points (recorded منسحب). */
  withdraw(room: MatchRoom, userId: string): void {
    const seat = room.seats.find((s) => s.userId === userId);
    if (!seat) return;
    if (room.status === "LOBBY") {
      room.seats = room.seats.filter((s) => s.userId !== userId);
      // An emptied lobby room must not linger — otherwise it shows as a ghost 0/4
      // card in the join page's room list. Drop it once the last seat leaves.
      if (room.seats.length === 0) {
        this.removeRoom(room.id);
        return;
      }
      this.sync(room);
      return;
    }
    if (room.status !== "IN_PROGRESS") return;
    seat.status = "WITHDRAWN";
    seat.totalPoints = 0;
    seat.connected = false;
    void this.deps.persist.markWithdrawn(room.id, userId).catch(() => {});

    // remove from the live round's rotation
    const r = room.round;
    if (r) {
      const idx = r.state.seats.indexOf(seat.seat);
      r.state.seats = r.state.seats.filter((x) => x !== seat.seat);
      if (r.state.seats.length > 0 && idx !== -1) {
        if (r.state.turnIndex >= r.state.seats.length) r.state.turnIndex = 0;
      }
    }

    const remaining = activeSeats(room);
    if (remaining.length < TT_MIN_PLAYERS || !hasConnectedHuman(room)) {
      // Table drops below the minimum, OR no connected human remains (only bots) →
      // close it; bots must never keep an abandoned match alive (mirrors Link Up's
      // hasConnectedHuman teardown). Everyone left loses their points.
      for (const s of remaining) s.totalPoints = 0;
      this.finishMatch(room, true);
      return;
    }
    // if it was their turn in normal mode, continue with the next player
    if (r && r.state.mode === "NORMAL") this.beginTurn(room);
    else this.sync(room);
  }

  // ---- round / match completion ------------------------------------------

  private finishRound(room: MatchRoom, reason: Parameters<typeof endRound>[1]): void {
    const r = room.round;
    if (!r) return;
    this.clear(room, "turn", "hintCountdown", "hintWindow", "round", "bot");
    this.deps.bots?.cancel(room);
    if (!r.state.done) r.state = endRound(r.state, reason).state;

    // tally round points into match totals + award XP per player
    const perSeat = scoreBySeat(r.state);
    const ranksBySeat = revealedRanksBySeat(r.state);
    const xpBySeat = new Map<number, number>();
    for (const s of activeSeats(room)) {
      const pts = perSeat[s.seat] ?? 0;
      s.totalPoints += pts;
      const xp = roundXp(pts, room.difficulty, ranksBySeat[s.seat] ?? []);
      xpBySeat.set(s.seat, xp);
    }

    void this.deps.persist
      .saveRound(room, r, perSeat)
      .catch((e) => console.error("[top-10] saveRound failed", e));
    void this.deps.persist
      .awardRoundXp(room, xpBySeat)
      .catch((e) => console.error("[top-10] awardRoundXp failed", e));

    const standings = this.standings(room);
    this.deps.emit(room.id, TT_SERVER_EVENTS.roundEnded, {
      reason: r.state.endReason ?? reason,
      roundNo: r.roundNo,
      standings,
    });

    // fold this round's reveals into the match-level accumulator (tiebreak spans all 3)
    accumulateRoundReveals(room);
    if (r.roundNo >= room.roundsTotal) {
      room.round = null;
      this.finishMatch(room);
    } else {
      const next = r.roundNo + 1;
      room.round = null;
      this.sync(room);
      // brief pause before the next round so the standings can be read
      setTimeout(() => {
        if (room.status === "IN_PROGRESS") this.startRound(room, next);
      }, 5000);
    }
  }

  private finishMatch(room: MatchRoom, abandoned = false): void {
    this.clear(room, "turn", "hintCountdown", "hintWindow", "round", "bot");
    this.deps.bots?.cancel(room);
    // fold an in-progress round (direct finish: withdrawal/no-question) before tally
    if (room.round) {
      accumulateRoundReveals(room);
      room.round = null;
    }
    room.status = abandoned ? "ABANDONED" : "ENDED";
    const standings = this.standings(room);
    const winner = !abandoned && standings.length > 0 && !standings[1]?.tiedWithPrev ? standings[0] : null;
    const xpForWinner = new Map<number, number>();
    if (winner) xpForWinner.set(winner.seat, matchWinBonus);
    void this.deps.persist
      .finishMatch(room, standings, winner?.userId ?? null, xpForWinner)
      .catch((e) => console.error("[top-10] finishMatch failed", e));
    this.deps.emit(room.id, TT_SERVER_EVENTS.matchEnded, { standings });
    this.sync(room);
    // free memory shortly after
    setTimeout(() => this.rooms.delete(room.id), 60_000);
  }

  // ---- views --------------------------------------------------------------

  private standings(room: MatchRoom): TtStandingRow[] {
    const inputs = room.seats.map((s) => ({
      userId: s.userId,
      points: s.status === "WITHDRAWN" ? 0 : s.totalPoints,
      revealedRanks: matchRevealedRanks(room, s.seat),
    }));
    const ranked = finalStandings(inputs);
    return ranked.map((row) => {
      const seatObj = room.seats.find((s) => s.userId === row.userId)!;
      return {
        userId: row.userId,
        username: seatObj.username,
        seat: seatObj.seat,
        points: row.points,
        place: row.place,
        tiedWithPrev: row.tiedWithPrev,
      };
    });
  }

  sync(room: MatchRoom): void {
    this.deps.emit(room.id, TT_SERVER_EVENTS.state, this.buildStateView(room));
  }

  buildStateView(room: MatchRoom): TtStateView {
    const r = room.round;
    const roundScores = r ? scoreBySeat(r.state) : {};
    const revealedByRank = new Map<number, { bySeat: number | null }>();
    if (r) for (const rec of r.state.reveals) revealedByRank.set(rec.rank, { bySeat: rec.bySeat });

    // Exactly 10 fixed rank cards (ranks never move). A revealed card shows the tied
    // player actually named for that rank.
    const cards = Array.from({ length: 10 }, (_, i) => {
      const rank = i + 1;
      const rev = revealedByRank.get(rank);
      const cp = r ? this.revealedPlayer(r, rank) : undefined;
      return {
        rank,
        revealed: !!rev,
        player: rev && cp ? { id: cp.playerId, name: cp.name, nameAr: cp.nameAr, value: cp.value, photoUrl: cp.photoUrl } : null,
        bySeat: rev?.bySeat ?? null,
      };
    });

    return {
      matchId: room.id,
      kind: room.kind,
      inviteCode: room.inviteCode,
      roomName: room.roomName,
      maxPlayers: room.maxPlayers,
      status: room.status,
      difficulty: room.difficulty,
      createdByUserId: room.createdByUserId,
      roundTimerSec: room.roundTimerSec,
      roundNo: r?.roundNo ?? 0,
      roundsTotal: room.roundsTotal,
      mode: r?.state.mode ?? "NORMAL",
      question: r
        ? { type: r.entry.type, titleAr: r.entry.titleAr, competitionAr: r.entry.competitionName, season: r.entry.season }
        : null,
      cards,
      seats: room.seats.map((s) => ({
        seat: s.seat,
        userId: s.userId,
        username: s.username,
        playerNumber: s.playerNumber,
        isBot: s.isBot,
        connected: s.connected,
        totalPoints: s.totalPoints,
        roundPoints: roundScores[s.seat] ?? 0,
        status: s.status,
        wrongAttempts: r?.state.wrongAttempts[s.seat] ?? 0,
        locked: r?.state.lockedSeats.includes(s.seat) ?? false,
      })),
      turnSeat: r && r.state.mode === "NORMAL" ? currentTurnSeat(r.state) : null,
      deadlineTs: room.deadlineTs,
      hint:
        r && r.state.mode === "HINT" && r.state.hint
          ? { phase: r.state.hint.phase, text: r.state.hint.phase === "OPEN" ? r.hintText : null, hintNumber: r.hintNumber, rank: r.state.hint.targetRank }
          : null,
      endRoundRequest: room.endRoundReq
        ? {
            bySeat: room.endRoundReq.bySeat,
            approvals: [...room.endRoundReq.approvals],
            needed: activeSeats(room).filter((s) => !s.isBot).length,
          }
        : null,
    };
  }

  // ---- timer utils --------------------------------------------------------

  private clear(room: MatchRoom, ...names: (keyof MatchRoom["timers"])[]): void {
    for (const n of names) {
      const t = room.timers[n];
      if (t) {
        clearTimeout(t);
        room.timers[n] = undefined;
      }
    }
  }

  removeRoom(matchId: string): void {
    const room = this.rooms.get(matchId);
    if (room) this.clear(room, "turn", "hintCountdown", "hintWindow", "round", "bot");
    this.rooms.delete(matchId);
  }
}

// ---- helpers ----------------------------------------------------------------

/** Map a guessed playerId to an outcome. A rank may have several accepted (tied)
 *  players: any of them at a still-hidden rank is "correct" for that rank; once the
 *  rank is revealed, every other tied player resolves to "already" (cancelled). */
function resolveOutcome(entry: CatalogEntry, state: RoundState, playerId: string): Outcome {
  const cp = entry.players.find((p) => p.playerId === playerId);
  if (!cp) return { type: "wrong" };
  if (state.hidden.includes(cp.rank)) return { type: "correct", rank: cp.rank };
  return { type: "already" };
}

function activeSeats(room: MatchRoom): TtSeat[] {
  return room.seats.filter((s) => s.status === "ACTIVE");
}

/** True iff a connected HUMAN remains in an active seat. Quick-play bots are seated
 *  connected:true (no socket) but must never keep an abandoned table alive — once
 *  the last human leaves, the match is torn down (mirrors Link Up's presence
 *  hasConnectedHuman). */
function hasConnectedHuman(room: MatchRoom): boolean {
  return room.seats.some((s) => s.connected && !s.isBot && s.status === "ACTIVE");
}

function nextFreeSeat(room: MatchRoom): number {
  const taken = new Set(room.seats.map((s) => s.seat));
  for (let i = 0; i < TT_MAX_PLAYERS; i++) if (!taken.has(i)) return i;
  return room.seats.length;
}

/** Keep a requested seat cap within [TT_MIN_PLAYERS, TT_MAX_PLAYERS]. */
function clampSeats(n: number): number {
  if (!Number.isFinite(n)) return TT_MAX_PLAYERS;
  return Math.max(TT_MIN_PLAYERS, Math.min(TT_MAX_PLAYERS, Math.round(n)));
}

/** All ranks a seat revealed across the whole match (for the standings tiebreak).
 *  Persisted reveals are summarized live from the active round only; completed
 *  rounds contribute via the running totalPoints + this best-effort accumulation. */
const matchRevealsBySeat = new WeakMap<MatchRoom, Record<number, number[]>>();

function matchRevealedRanks(room: MatchRoom, seat: number): number[] {
  const acc = matchRevealsBySeat.get(room) ?? {};
  const fromCompleted = acc[seat] ?? [];
  const fromCurrent = room.round ? revealedRanksBySeat(room.round.state)[seat] ?? [] : [];
  return [...fromCompleted, ...fromCurrent];
}

/** Called by finishRound to fold the just-finished round's reveals into the
 *  match-level accumulator (so the tiebreak spans all 3 rounds). */
export function accumulateRoundReveals(room: MatchRoom): void {
  const acc = matchRevealsBySeat.get(room) ?? {};
  if (room.round) {
    const bySeat = revealedRanksBySeat(room.round.state);
    for (const [seat, ranks] of Object.entries(bySeat)) {
      const k = Number(seat);
      acc[k] = [...(acc[k] ?? []), ...ranks];
    }
  }
  matchRevealsBySeat.set(room, acc);
}

function cryptoRandomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
