import {
  GP_SURVIVAL_BONUS,
  gpMatchWinBonus,
  pickerPoints,
  winnerPoints,
} from "@fb/guess-player-engine";
import {
  GP_LIMITS,
  GP_SERVER_EVENTS,
  GP_TIMING,
  type GpAskInput,
  type GpDifficulty,
  type GpMode,
  type GpQuestionView,
  type GpStandingRow,
  type GpStateView,
  type GpWrongGuessView,
} from "@fb/shared";
import { answer, type GpFactsSource } from "./facts.js";
import type { GpPersistence } from "./persistence.js";
import type { ActiveGpRound, GpMatchRoom, GpSeat } from "./types.js";

export interface GpMatchDeps {
  facts: GpFactsSource;
  persist: GpPersistence;
  emit: (target: string, event: string, payload: unknown) => void;
  rng?: () => number;
}

let inviteSeq = Math.floor(Math.random() * 9000) + 1000;
const nextInvite = () => `G${inviteSeq++}`;

type EndReason = "CORRECT_GUESS" | "TIMER" | "ABANDONED";

/**
 * Authoritative match orchestrator (mirrors Top Ten's Matches). Owns the
 * in-memory rooms + timers; rules come from @fb/guess-player-engine; all
 * football reads go through the GpFactsSource port.
 *
 * SECRECY INVARIANT: `round.hidden` never leaves this process except through
 * the end-of-round reveal (or the VS_HUMANS picker's private pick echo in
 * socket.ts). buildStateView carries no hidden-player field at all.
 *
 * Async actions (ask/pick/guess feedback) resolve entities against the DB;
 * every await is followed by a revalidation guard (same round object, same
 * turn, still playing) so a timer that fired mid-resolution wins cleanly.
 */
export class GpMatches {
  private rooms = new Map<string, GpMatchRoom>();
  constructor(private deps: GpMatchDeps) {}

  get(matchId: string): GpMatchRoom | undefined {
    return this.rooms.get(matchId);
  }
  list(): GpMatchRoom[] {
    return [...this.rooms.values()];
  }

  // ---- lifecycle ----------------------------------------------------------

  createManual(
    creator: { userId: string; username: string; playerNumber: number },
    opts: {
      mode: GpMode;
      difficulty?: GpDifficulty;
      roundsTotal?: number;
      roomName?: string | null;
      maxPlayers?: number;
      isPrivate?: boolean;
    },
  ): GpMatchRoom {
    const id = cryptoRandomId();
    const room: GpMatchRoom = {
      id,
      persistId: id,
      kind: "MANUAL",
      mode: opts.mode,
      difficulty: opts.mode === "VS_SYSTEM" ? (opts.difficulty ?? "MEDIUM") : null,
      roundsTotal: clampRounds(opts.roundsTotal ?? GP_LIMITS.defaultRounds),
      roundTimerSec: GP_TIMING.roundSec,
      turnTimerSec: GP_TIMING.turnSec,
      inviteCode: nextInvite(),
      roomName: opts.roomName?.trim() || null,
      maxPlayers: clampSeats(opts.maxPlayers ?? GP_LIMITS.maxPlayers),
      isPrivate: opts.isPrivate ?? false,
      createdByUserId: creator.userId,
      status: "LOBBY",
      seats: [],
      usedPlayerIds: new Set(),
      round: null,
      newMatch: null,
      deadlineTs: null,
      timers: {},
      persisted: false,
    };
    this.rooms.set(id, room);
    this.addSeat(room, creator);
    this.touch(room);
    return room;
  }

  createQuickPlay(difficulty: GpDifficulty): GpMatchRoom {
    const id = cryptoRandomId();
    const room: GpMatchRoom = {
      id,
      persistId: id,
      kind: "QUICK_PLAY",
      mode: "VS_SYSTEM", // quick play is ALWAYS vs the system (locked rule)
      difficulty,
      roundsTotal: GP_LIMITS.defaultRounds,
      roundTimerSec: GP_TIMING.roundSec,
      turnTimerSec: GP_TIMING.turnSec,
      inviteCode: null,
      roomName: null,
      maxPlayers: GP_LIMITS.quickPlayMaxPlayers,
      isPrivate: false,
      createdByUserId: "",
      status: "LOBBY",
      seats: [],
      usedPlayerIds: new Set(),
      round: null,
      newMatch: null,
      deadlineTs: null,
      timers: {},
      persisted: false,
    };
    this.rooms.set(id, room);
    this.touch(room);
    return room;
  }

  addSeat(
    room: GpMatchRoom,
    user: { userId: string; username: string; playerNumber: number },
  ): GpSeat | null {
    if (room.seats.length >= room.maxPlayers) return null;
    const existing = room.seats.find((s) => s.userId === user.userId);
    if (existing) {
      existing.connected = true;
      return existing;
    }
    const seat: GpSeat = {
      seat: nextFreeSeat(room),
      userId: user.userId,
      username: user.username,
      playerNumber: user.playerNumber,
      connected: true,
      totalPoints: 0,
      status: "ACTIVE",
    };
    room.seats.push(seat);
    room.seats.sort((a, b) => a.seat - b.seat);
    this.touch(room);
    return seat;
  }

  /** Start a manual room (creator only, needs the room minimum) or a
   *  quick-play room (`allowSolo` — solo VS_SYSTEM is an approved decision). */
  start(room: GpMatchRoom, byUserId: string, allowSolo = false): { ok: boolean; error?: string } {
    if (room.status !== "LOBBY") return { ok: false, error: "ALREADY_STARTED" };
    if (room.kind === "MANUAL" && room.createdByUserId !== byUserId)
      return { ok: false, error: "NOT_CREATOR" };
    const min = allowSolo ? 1 : GP_LIMITS.minPlayers;
    if (activeSeats(room).length < min) return { ok: false, error: "NOT_ENOUGH_PLAYERS" };
    this.touch(room);
    room.status = "IN_PROGRESS";
    void this.deps.persist
      .createMatch(room)
      .then(() => (room.persisted = true))
      .catch(() => {});
    this.deps.emit(room.id, GP_SERVER_EVENTS.matchStarted, { matchId: room.id });
    void this.startRound(room, 1, this.seatOf(room, room.createdByUserId) ?? activeSeats(room)[0]?.seat ?? null);
    return { ok: true };
  }

  /** `pickerSeat` is only meaningful for VS_HUMANS: round 1 = the creator,
   *  later rounds = the previous winner (or the same picker after a timeout). */
  private async startRound(room: GpMatchRoom, roundNo: number, pickerSeat: number | null): Promise<void> {
    const contestants = activeSeats(room);
    if (contestants.length === 0) return;
    const round: ActiveGpRound = {
      roundNo,
      persistRoundId: null,
      phase: room.mode === "VS_HUMANS" ? "PICKING" : "PLAYING",
      hidden: null,
      pickerSeat: room.mode === "VS_HUMANS" ? pickerSeat : null,
      turnOrder: [],
      turnIndex: 0,
      turnNo: 0,
      questions: [],
      wrongGuesses: [],
      guessesLeft: new Map(contestants.map((s) => [s.seat, GP_LIMITS.guessAttempts])),
      roundDeadlineTs: null,
    };
    room.round = round;

    if (room.mode === "VS_HUMANS") {
      // ensure the picker is a live seat; else fall back to the first contestant
      const pickerOk = contestants.some((s) => s.seat === round.pickerSeat);
      if (!pickerOk) round.pickerSeat = contestants[0]!.seat;
      this.beginPicking(room);
      return;
    }

    const hidden = await this.deps.facts.pickHidden(room.difficulty, room.usedPlayerIds);
    if (room.round !== round || room.status !== "IN_PROGRESS") return; // superseded meanwhile
    if (!hidden) {
      this.finishMatch(room, false); // pool exhausted — end gracefully
      return;
    }
    this.beginPlaying(room, hidden);
  }

  // ---- VS_HUMANS pick phase ------------------------------------------------

  private beginPicking(room: GpMatchRoom): void {
    const r = room.round;
    if (!r) return;
    this.clear(room, "pick", "turn");
    room.deadlineTs = Date.now() + GP_TIMING.pickSec * 1000;
    room.timers.pick = setTimeout(() => void this.onPickTimeout(room, r), GP_TIMING.pickSec * 1000);
    this.sync(room);
  }

  async pick(room: GpMatchRoom, byUserId: string, playerId: string): Promise<void> {
    const r = room.round;
    if (!r || room.status !== "IN_PROGRESS" || r.phase !== "PICKING") return;
    const seat = this.seatOf(room, byUserId);
    if (seat == null || seat !== r.pickerSeat) return;
    this.touch(room);
    if (room.usedPlayerIds.has(playerId)) {
      this.toastTo(room, byUserId, "اختير هذا اللاعب في جولة سابقة — اختر لاعبًا آخر");
      return;
    }
    const hidden = await this.deps.facts.loadHidden(playerId);
    if (room.round !== r || r.phase !== "PICKING" || room.status !== "IN_PROGRESS") return;
    if (!hidden) {
      this.toastTo(room, byUserId, "لاعب غير معروف — اختر من نتائج البحث");
      return;
    }
    // Private echo so the picker sees who they hid (their own choice).
    const pickerSocket = room.seats.find((s) => s.seat === r.pickerSeat)?.socketId;
    if (pickerSocket) {
      this.deps.emit(pickerSocket, GP_SERVER_EVENTS.pickConfirmed, {
        player: { id: hidden.ref.id, name: hidden.ref.name, nameAr: hidden.ref.nameAr },
      });
    }
    this.beginPlaying(room, hidden);
  }

  private async onPickTimeout(room: GpMatchRoom, r: ActiveGpRound): Promise<void> {
    if (room.round !== r || r.phase !== "PICKING" || room.status !== "IN_PROGRESS") return;
    // The picker stalled — auto-pick from the whole dealable pool so the round
    // (and the table) never hangs on one player.
    this.deps.emit(room.id, GP_SERVER_EVENTS.toast, {
      text: "انتهى وقت الاختيار — النظام اختار لاعبًا",
    });
    const hidden = await this.deps.facts.pickHidden(null, room.usedPlayerIds);
    if (room.round !== r || r.phase !== "PICKING" || room.status !== "IN_PROGRESS") return;
    if (!hidden) {
      this.finishMatch(room, false);
      return;
    }
    this.beginPlaying(room, hidden);
  }

  // ---- playing phase -------------------------------------------------------

  private beginPlaying(room: GpMatchRoom, hidden: NonNullable<ActiveGpRound["hidden"]>): void {
    const r = room.round;
    if (!r) return;
    this.clear(room, "pick");
    r.hidden = hidden;
    r.phase = "PLAYING";
    room.usedPlayerIds.add(hidden.ref.id);
    // Contestants = active seats minus the picker; rotate the opener per round.
    const order = activeSeats(room)
      .map((s) => s.seat)
      .filter((seat) => seat !== r.pickerSeat);
    const rotate = (r.roundNo - 1) % Math.max(1, order.length);
    r.turnOrder = [...order.slice(rotate), ...order.slice(0, rotate)];
    r.turnIndex = 0;
    // The 10-minute clock starts when questions can start (not during picking).
    r.roundDeadlineTs = Date.now() + room.roundTimerSec * 1000;
    this.clear(room, "round");
    room.timers.round = setTimeout(() => this.onRoundTimer(room), room.roundTimerSec * 1000);
    void this.deps.persist
      .createRound(
        room,
        r.roundNo,
        hidden.ref.id,
        room.seats.find((s) => s.seat === r.pickerSeat)?.userId ?? null,
      )
      .then((id) => (r.persistRoundId = id))
      .catch(() => {});
    this.beginTurn(room);
  }

  private currentTurnSeat(r: ActiveGpRound): number | null {
    if (r.phase !== "PLAYING" || r.turnOrder.length === 0) return null;
    return r.turnOrder[r.turnIndex % r.turnOrder.length] ?? null;
  }

  private beginTurn(room: GpMatchRoom): void {
    const r = room.round;
    if (!r || r.phase !== "PLAYING") return;
    const seat = this.currentTurnSeat(r);
    if (seat == null) return;
    this.clear(room, "turn");
    room.deadlineTs = Date.now() + room.turnTimerSec * 1000;
    const turnAt = r.turnNo;
    room.timers.turn = setTimeout(
      () => this.onTurnTimeout(room, r, seat, turnAt),
      room.turnTimerSec * 1000,
    );
    this.sync(room);
  }

  private onTurnTimeout(room: GpMatchRoom, r: ActiveGpRound, seat: number, turnAt: number): void {
    if (room.round !== r || r.phase !== "PLAYING" || room.status !== "IN_PROGRESS") return;
    if (this.currentTurnSeat(r) !== seat || r.turnNo !== turnAt) return;
    this.advanceTurn(room);
  }

  private advanceTurn(room: GpMatchRoom): void {
    const r = room.round;
    if (!r || r.turnOrder.length === 0) return;
    r.turnIndex = (r.turnIndex + 1) % r.turnOrder.length;
    this.beginTurn(room);
  }

  /** Ask one structured question. UNKNOWN answers do NOT consume the turn
   *  (locked rule) — the asker keeps it with a fresh timer. */
  async ask(room: GpMatchRoom, byUserId: string, input: GpAskInput): Promise<void> {
    const r = room.round;
    if (!r || room.status !== "IN_PROGRESS" || r.phase !== "PLAYING" || !r.hidden) return;
    const seat = this.seatOf(room, byUserId);
    if (seat == null || seat !== this.currentTurnSeat(r) || seat === r.pickerSeat) return;
    this.touch(room);
    const turnAt = r.turnNo;

    const resolved = await this.deps.facts.resolveAsk(input);
    // Revalidate after the await: the turn timer (or another action) may have
    // moved the game on while we were resolving.
    if (room.round !== r || r.phase !== "PLAYING" || room.status !== "IN_PROGRESS") return;
    if (this.currentTurnSeat(r) !== seat || r.turnNo !== turnAt) return;
    if (!resolved) {
      this.toastTo(room, byUserId, "تعذّر التحقق من السؤال — اختر من نتائج البحث");
      return; // nothing consumed
    }

    const a = answer(resolved.q, r.hidden.pack);
    r.turnNo++;
    const view: GpQuestionView = {
      turnNo: r.turnNo,
      seat,
      template: input.template,
      params: resolved.params,
      answer: a,
    };
    r.questions.push(view);
    void this.deps.persist
      .saveQuestion(r.persistRoundId, view.turnNo, byUserId, view.template, resolved.params, a)
      .catch((e) => console.error("[guess-player] saveQuestion failed", e));
    this.deps.emit(room.id, GP_SERVER_EVENTS.question, view);

    if (a === "UNKNOWN") {
      // "لا يمكن الإجابة" — turn kept, fresh clock.
      this.beginTurn(room);
    } else {
      this.advanceTurn(room);
    }
  }

  /** Spend one of the 3 guess attempts. Correctness is checked synchronously
   *  against the hidden FactPack; only the public feedback needs the DB. */
  async guess(room: GpMatchRoom, byUserId: string, playerId: string): Promise<void> {
    const r = room.round;
    if (!r || room.status !== "IN_PROGRESS" || r.phase !== "PLAYING" || !r.hidden) return;
    const seat = this.seatOf(room, byUserId);
    if (seat == null || seat !== this.currentTurnSeat(r) || seat === r.pickerSeat) return;
    this.touch(room);
    const left = r.guessesLeft.get(seat) ?? 0;
    if (left <= 0) {
      this.toastTo(room, byUserId, "استنفدت محاولات التخمين — يمكنك الاستمرار بالأسئلة");
      return;
    }

    const correct = playerId === r.hidden.pack.playerId;
    r.turnNo++;
    const attemptNo = GP_LIMITS.guessAttempts - left + 1;
    void this.deps.persist
      .saveGuess(r.persistRoundId, byUserId, playerId, correct, attemptNo)
      .catch((e) => console.error("[guess-player] saveGuess failed", e));

    if (correct) {
      void this.finishRound(room, "CORRECT_GUESS", seat);
      return;
    }

    r.guessesLeft.set(seat, left - 1);
    this.advanceTurn(room);
    // Public feedback (the named player is information for everyone) — resolve
    // the display ref after advancing so the tempo never waits on the DB.
    const named = await this.deps.facts.resolvePlayer(playerId);
    if (room.round !== r) return;
    const payload: GpWrongGuessView = {
      seat,
      player: named
        ? { id: named.id, name: named.name, nameAr: named.nameAr }
        : { id: playerId, name: "غير معروف", nameAr: null },
      attemptsLeft: left - 1,
    };
    r.wrongGuesses.push(payload);
    this.deps.emit(room.id, GP_SERVER_EVENTS.wrongGuess, payload);
    this.sync(room);
  }

  private onRoundTimer(room: GpMatchRoom): void {
    const r = room.round;
    if (r && r.phase === "PLAYING" && room.status === "IN_PROGRESS") {
      void this.finishRound(room, "TIMER", null);
    }
  }

  // ---- round / match completion --------------------------------------------

  private async finishRound(
    room: GpMatchRoom,
    reason: EndReason,
    winnerSeat: number | null,
  ): Promise<void> {
    const r = room.round;
    if (!r || !r.hidden) return;
    this.clear(room, "turn", "round", "pick", "next");
    room.deadlineTs = null;

    const remainingSec = r.roundDeadlineTs ? Math.max(0, (r.roundDeadlineTs - Date.now()) / 1000) : 0;
    const winner = winnerSeat != null ? room.seats.find((s) => s.seat === winnerSeat) : undefined;
    const pts =
      winner != null
        ? winnerPoints(remainingSec, room.mode === "VS_SYSTEM" ? room.difficulty : null)
        : 0;
    if (winner) winner.totalPoints += pts;

    // VS_HUMANS picker economics (approved): 25% of the winner's points on a
    // solved round; the fixed survival bonus on an unsolved one. A withdrawn
    // picker earns nothing.
    const picker =
      r.pickerSeat != null
        ? room.seats.find((s) => s.seat === r.pickerSeat && s.status === "ACTIVE")
        : undefined;
    let pickerPts = 0;
    if (room.mode === "VS_HUMANS" && picker) {
      if (reason === "CORRECT_GUESS") pickerPts = pickerPoints(pts);
      else if (reason === "TIMER") pickerPts = GP_SURVIVAL_BONUS;
      picker.totalPoints += pickerPts;
    }

    void this.deps.persist
      .finishRound(room, r, reason, winner?.userId ?? null, pts)
      .catch((e) => console.error("[guess-player] finishRound failed", e));
    if (winner && pts > 0) {
      void this.deps.persist
        .awardXp(winner.userId, room.persistId, pts, `${room.persistId}:r${r.roundNo}:${winner.userId}:win`, "ROUND_WIN")
        .catch(() => {});
    }
    if (picker && pickerPts > 0) {
      const reasonKey = reason === "CORRECT_GUESS" ? "PICKER_SHARE" : "SURVIVAL_BONUS";
      void this.deps.persist
        .awardXp(picker.userId, room.persistId, pickerPts, `${room.persistId}:r${r.roundNo}:${picker.userId}:picker`, reasonKey)
        .catch(() => {});
    }

    this.deps.emit(room.id, GP_SERVER_EVENTS.reveal, {
      roundNo: r.roundNo,
      reason,
      player: {
        id: r.hidden.ref.id,
        name: r.hidden.ref.name,
        nameAr: r.hidden.ref.nameAr,
        photoUrl: r.hidden.ref.photoUrl,
      },
      winnerSeat: winner?.seat ?? null,
      winnerPoints: pts,
      pickerSeat: picker?.seat ?? null,
      pickerPoints: pickerPts,
    });
    this.deps.emit(room.id, GP_SERVER_EVENTS.roundEnded, {
      reason,
      roundNo: r.roundNo,
      standings: this.standings(room),
    });

    // Next picker (VS_HUMANS): the correct guesser; a timeout keeps the SAME
    // picker (locked rule).
    const nextPicker =
      room.mode === "VS_HUMANS"
        ? reason === "CORRECT_GUESS" && winner
          ? winner.seat
          : r.pickerSeat
        : null;

    const finishedRoundNo = r.roundNo;
    this.sync(room);
    if (finishedRoundNo >= room.roundsTotal || reason === "ABANDONED") {
      room.round = null;
      room.timers.next = setTimeout(() => this.finishMatch(room, reason === "ABANDONED"), GP_TIMING.nextRoundPauseMs);
      return;
    }
    room.timers.next = setTimeout(() => {
      if (room.status === "IN_PROGRESS") {
        room.round = null;
        void this.startRound(room, finishedRoundNo + 1, nextPicker);
      }
    }, GP_TIMING.nextRoundPauseMs);
  }

  private finishMatch(room: GpMatchRoom, abandoned: boolean): void {
    this.clear(room, "turn", "round", "pick", "next");
    room.round = null;
    room.deadlineTs = null;
    room.status = abandoned ? "ABANDONED" : "ENDED";
    const standings = this.standings(room);
    const winner =
      !abandoned && standings.length > 0 && !standings[1]?.tiedWithPrev ? standings[0]! : null;
    if (winner) {
      void this.deps.persist
        .awardXp(winner.userId, room.persistId, gpMatchWinBonus, `${room.persistId}:${winner.userId}:matchwin`, "MATCH_WIN")
        .catch(() => {});
    }
    void this.deps.persist
      .finishMatch(room, winner?.userId ?? null)
      .catch((e) => console.error("[guess-player] finishMatch failed", e));
    this.deps.emit(room.id, GP_SERVER_EVENTS.matchEnded, { standings });

    if (abandoned) {
      // Never keep a table alive with no humans (final ruling #2): the match
      // row is already terminal in the DB; drop the in-memory room NOW.
      this.sync(room);
      this.removeRoom(room.id);
      return;
    }
    this.openNewMatchWindow(room);
  }

  // ---- play again at the same table (mirrors Top Ten's new-round vote) ------

  private openNewMatchWindow(room: GpMatchRoom): void {
    room.newMatch = {
      readySeats: new Set(),
      deadlineTs: Date.now() + GP_TIMING.newMatchGraceSec * 1000,
    };
    this.clear(room, "newMatch");
    room.timers.newMatch = setTimeout(
      () => this.resolveNewMatch(room, true),
      GP_TIMING.newMatchGraceSec * 1000,
    );
    this.sync(room);
  }

  requestNewMatch(room: GpMatchRoom, byUserId: string): void {
    const seat = this.seatOf(room, byUserId);
    if (room.status !== "ENDED" || !room.newMatch || seat == null) return;
    this.touch(room);
    room.newMatch.readySeats.add(seat);
    this.resolveNewMatch(room, false);
  }

  private resolveNewMatch(room: GpMatchRoom, byTimer: boolean): void {
    if (room.status !== "ENDED" || !room.newMatch) return;
    const connected = room.seats.filter((s) => s.connected && s.status === "ACTIVE");
    const allReady = connected.every((s) => room.newMatch!.readySeats.has(s.seat));
    if (!byTimer && !allReady) {
      this.sync(room);
      return;
    }
    const min = room.kind === "QUICK_PLAY" ? 1 : GP_LIMITS.minPlayers;
    if (connected.length < min) {
      this.clear(room, "newMatch");
      room.newMatch = null;
      this.deps.emit(room.id, GP_SERVER_EVENTS.tableClosed, { text: "أُغلقت الطاولة" });
      this.removeRoom(room.id);
      return;
    }
    this.restartMatch(room);
  }

  private restartMatch(room: GpMatchRoom): void {
    this.clear(room, "turn", "round", "pick", "next", "newMatch");
    room.newMatch = null;
    room.seats = room.seats.filter((s) => s.status === "ACTIVE" && s.connected);
    for (const s of room.seats) s.totalPoints = 0;
    // Fresh persistence identity; usedPlayerIds is kept so a replay never
    // repeats a hidden player from the previous match at this table.
    room.persistId = cryptoRandomId();
    room.persisted = false;
    room.round = null;
    room.status = "IN_PROGRESS";
    void this.deps.persist
      .createMatch(room)
      .then(() => (room.persisted = true))
      .catch(() => {});
    this.deps.emit(room.id, GP_SERVER_EVENTS.matchStarted, { matchId: room.id });
    void this.startRound(room, 1, this.seatOf(room, room.createdByUserId) ?? room.seats[0]?.seat ?? null);
  }

  // ---- presence / withdrawal ------------------------------------------------

  setAway(room: GpMatchRoom, userId: string, away: boolean): void {
    const seat = room.seats.find((s) => s.userId === userId);
    if (!seat) return;
    if (!!seat.away === away) return;
    seat.away = away;
    if (away) {
      this.deps.emit(room.id, GP_SERVER_EVENTS.awayNotice, {
        seat: seat.seat,
        username: seat.username,
      });
    }
    this.sync(room);
  }

  withdraw(room: GpMatchRoom, userId: string): void {
    const seat = room.seats.find((s) => s.userId === userId);
    if (!seat) return;
    if (room.status === "LOBBY") {
      room.seats = room.seats.filter((s) => s.userId !== userId);
      if (room.seats.length === 0) {
        this.removeRoom(room.id);
        return;
      }
      this.sync(room);
      return;
    }
    if (room.status === "ENDED") {
      room.seats = room.seats.filter((s) => s.userId !== userId);
      room.newMatch?.readySeats.delete(seat.seat);
      if (!room.seats.some((s) => s.connected && s.status === "ACTIVE")) {
        this.clear(room, "newMatch");
        room.newMatch = null;
        this.removeRoom(room.id);
        return;
      }
      this.resolveNewMatch(room, false);
      return;
    }
    if (room.status !== "IN_PROGRESS") return;

    seat.status = "WITHDRAWN";
    seat.totalPoints = 0; // a withdrawal forfeits accumulated points (platform convention)
    seat.connected = false;
    void this.deps.persist.markWithdrawn(room.persistId, userId).catch(() => {});

    const r = room.round;
    if (r) {
      const wasTurn = this.currentTurnSeat(r) === seat.seat;
      const idx = r.turnOrder.indexOf(seat.seat);
      if (idx !== -1) {
        r.turnOrder.splice(idx, 1);
        if (r.turnOrder.length > 0) {
          if (idx < r.turnIndex) r.turnIndex--;
          r.turnIndex = r.turnIndex % r.turnOrder.length;
        }
      }
      // The PICKER left. Mid-PICKING → pass the pick to the next contestant.
      // Mid-PLAYING → the round continues (the SYSTEM answers, not the picker);
      // they simply forfeit any picker points.
      if (r.pickerSeat === seat.seat && r.phase === "PICKING") {
        const next = activeSeats(room)[0];
        if (next) {
          r.pickerSeat = next.seat;
          r.turnOrder = [];
          this.beginPicking(room);
        }
      } else if (r.phase === "PLAYING" && r.turnOrder.length > 0 && wasTurn) {
        this.beginTurn(room);
      }
    }

    if (!hasConnectedHuman(room)) {
      this.finishMatch(room, true);
      return;
    }
    const r2 = room.round;
    if (r2 && r2.phase === "PLAYING" && r2.turnOrder.length === 0) {
      // No contestant remains (e.g. only the picker is left) — nothing can be
      // guessed anymore; end the round as abandoned and let the match resolve.
      void this.finishRound(room, "ABANDONED", null);
      return;
    }
    this.sync(room);
  }

  closeRoom(room: GpMatchRoom, byUserId: string): void {
    if (room.createdByUserId !== byUserId) return;
    if (room.status === "ABANDONED") return;
    if (room.status === "ENDED") {
      this.clear(room, "newMatch");
      room.newMatch = null;
      this.deps.emit(room.id, GP_SERVER_EVENTS.tableClosed, { text: "أُغلقت الطاولة" });
      this.removeRoom(room.id);
      return;
    }
    this.deps.emit(room.id, GP_SERVER_EVENTS.toast, { text: "أُغلقت الطاولة" });
    if (room.status === "LOBBY") {
      this.deps.emit(room.id, GP_SERVER_EVENTS.matchEnded, { standings: this.standings(room) });
      this.removeRoom(room.id);
      return;
    }
    this.finishMatch(room, true);
  }

  // ---- views -----------------------------------------------------------------

  private standings(room: GpMatchRoom): GpStandingRow[] {
    const rows = room.seats
      .map((s) => ({
        userId: s.userId,
        username: s.username,
        seat: s.seat,
        points: s.status === "WITHDRAWN" ? 0 : s.totalPoints,
      }))
      .sort((a, b) => b.points - a.points);
    // Standard competition ranking: ties share the first place of their group.
    let place = 1;
    return rows.map((row, i) => {
      const tiedWithPrev = i > 0 && rows[i - 1]!.points === row.points;
      if (!tiedWithPrev) place = i + 1;
      return { ...row, place, tiedWithPrev };
    });
  }

  sync(room: GpMatchRoom): void {
    this.deps.emit(room.id, GP_SERVER_EVENTS.state, this.buildStateView(room));
  }

  /** SANITIZED snapshot — carries NO hidden-player field at all. */
  buildStateView(room: GpMatchRoom): GpStateView {
    const r = room.round;
    return {
      matchId: room.id,
      kind: room.kind,
      mode: room.mode,
      inviteCode: room.inviteCode,
      roomName: room.roomName,
      maxPlayers: room.maxPlayers,
      status: room.status,
      difficulty: room.difficulty,
      createdByUserId: room.createdByUserId,
      roundNo: r?.roundNo ?? 0,
      roundsTotal: room.roundsTotal,
      phase: r?.phase ?? null,
      seats: room.seats.map((s) => ({
        seat: s.seat,
        userId: s.userId,
        username: s.username,
        playerNumber: s.playerNumber,
        connected: s.connected,
        totalPoints: s.totalPoints,
        status: s.status,
        guessesLeft: r?.guessesLeft.get(s.seat) ?? GP_LIMITS.guessAttempts,
        isPicker: r?.pickerSeat === s.seat,
        away: s.away ?? false,
      })),
      questions: r?.questions ?? [],
      wrongGuesses: r?.wrongGuesses ?? [],
      turnSeat: r ? this.currentTurnSeat(r) : null,
      deadlineTs: room.deadlineTs,
      roundDeadlineTs: r?.roundDeadlineTs ?? null,
      newMatchRequest: room.newMatch
        ? {
            readySeats: [...room.newMatch.readySeats],
            needed: room.seats.filter((s) => s.connected && s.status === "ACTIVE").length,
            deadlineTs: room.newMatch.deadlineTs,
          }
        : null,
    };
  }

  // ---- idle close (final ruling #2) -------------------------------------------

  /** Reset the 30-min idle clock. Called on every HUMAN action (create/join/
   *  start/pick/ask/guess/replay-ready) — never by auto-advancing timers, so a
   *  fully-AFK table (turn timeouts, auto replays) still closes. */
  private touch(room: GpMatchRoom): void {
    this.clear(room, "idle");
    room.timers.idle = setTimeout(() => this.closeIdle(room), GP_TIMING.idleCloseMs);
  }

  private closeIdle(room: GpMatchRoom): void {
    if (!this.rooms.has(room.id)) return;
    this.deps.emit(room.id, GP_SERVER_EVENTS.tableClosed, {
      text: "أُغلقت الطاولة لعدم النشاط",
    });
    if (room.status === "IN_PROGRESS") {
      this.finishMatch(room, true); // abandoned → persists terminal status + removes
      return;
    }
    this.removeRoom(room.id);
  }

  // ---- utils -----------------------------------------------------------------

  private seatOf(room: GpMatchRoom, userId: string): number | null {
    return room.seats.find((s) => s.userId === userId && s.status === "ACTIVE")?.seat ?? null;
  }

  private toastTo(room: GpMatchRoom, userId: string, text: string): void {
    const socketId = room.seats.find((s) => s.userId === userId)?.socketId;
    if (socketId) this.deps.emit(socketId, GP_SERVER_EVENTS.toast, { text });
  }

  private clear(room: GpMatchRoom, ...names: (keyof GpMatchRoom["timers"])[]): void {
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
    if (room) this.clear(room, "turn", "round", "pick", "next", "newMatch", "idle");
    this.rooms.delete(matchId);
  }
}

// ---- helpers ------------------------------------------------------------------

function activeSeats(room: GpMatchRoom): GpSeat[] {
  return room.seats.filter((s) => s.status === "ACTIVE");
}

function hasConnectedHuman(room: GpMatchRoom): boolean {
  return room.seats.some((s) => s.connected && s.status === "ACTIVE");
}

function nextFreeSeat(room: GpMatchRoom): number {
  const taken = new Set(room.seats.map((s) => s.seat));
  for (let i = 0; i < GP_LIMITS.maxPlayers; i++) if (!taken.has(i)) return i;
  return room.seats.length;
}

function clampSeats(n: number): number {
  if (!Number.isFinite(n)) return GP_LIMITS.maxPlayers;
  return Math.max(GP_LIMITS.minPlayers, Math.min(GP_LIMITS.maxPlayers, Math.round(n)));
}

function clampRounds(n: number): number {
  if (!Number.isFinite(n)) return GP_LIMITS.defaultRounds;
  return Math.max(GP_LIMITS.minRounds, Math.min(GP_LIMITS.maxRounds, Math.round(n)));
}

function cryptoRandomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
