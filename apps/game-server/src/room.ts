import {
  applyAction,
  buildSidePots,
  clearRoundCommitments,
  computeFold,
  isHandOver,
  isRoundComplete,
  legalActions,
  openRound,
  resolveShowdown,
  validateClaim,
  explainRank,
  type Action,
  type BettingSeat,
  type BettingState,
  type Card,
  type PotSeat,
  type ResolveSeat,
  type WitnessGroup,
} from "@fp/engine";
import {
  SERVER_EVENTS,
  type ClaimEvidenceGroup,
  type PlayerView,
  type PotView,
} from "@fp/shared";
import type {
  BetRecord,
  CardSource,
  Clock,
  Emitter,
  LedgerMovement,
  RoomPersistence,
  TimerService,
} from "./ports.js";
import type { DealtCard, RoomPlayer, RoomState } from "./types.js";

export interface RoomDeps {
  cards: CardSource;
  persistence: RoomPersistence;
  emitter: Emitter;
  timers: TimerService;
  clock: Clock;
}

const TURN_KEY = "turn";
const CLAIM_KEY = "claim";
const NEXT_HAND_KEY = "nexthand";

/**
 * Authoritative game-room orchestrator (Section 8 state machine). Holds the
 * in-memory room state, drives phase transitions using the pure engine, and
 * persists every money move inside a DB transaction via the persistence port.
 * All sensitive decisions happen here — never on the client.
 */
export class GameRoom {
  /** Server-side monotonic action counter — the source of wallet idempotency
   *  keys for betting actions. Never derived from client input (FIX #3). */
  private actionSeq = 0;

  /** Single-resolve latch: a hand resolves exactly once even if concurrent
   *  claims both pass the "all claimed" check. Prevents duplicate
   *  GameResults/UserStats (the wallet is also idempotent). Reset at the start
   *  of every hand (feature #7) so the guard holds independently per hand. */
  private resolved = false;

  /** Re-entrancy latch around the async hand setup (deal/antes): blocks a second
   *  startNextHand (e.g. auto-timer racing an explicit trigger) from double-dealing. */
  private startingHand = false;

  constructor(
    readonly state: RoomState,
    private readonly deps: RoomDeps,
  ) {}

  // -- lifecycle -----------------------------------------------------------

  /**
   * Host starts the FIRST hand of the session: every present player must afford
   * the mandatory ante (refuse otherwise). Subsequent hands roll over via
   * startNextHand() with lenient sit-out rules (feature #7).
   */
  async start(): Promise<void> {
    const seated = this.state.players.filter(
      (p) => p.status !== "DISCONNECTED" && p.connected,
    );
    if (seated.length < 2) throw new Error("Need at least 2 players to start");

    // FIX #2: source each seat's spendable `available` from the authoritative
    // wallet balance (never a guessed 0/1000), and refuse to start if anyone
    // cannot cover the mandatory ante — so the in-memory balance never goes
    // negative and stays in lockstep with the ledger.
    const ante = BigInt(this.state.config.ante);
    const balances = await this.deps.persistence.getBalances(
      seated.map((p) => p.userId),
    );
    for (const p of seated) {
      const balance = balances.get(p.userId);
      if (balance === undefined) {
        throw new Error(`تعذّر قراءة رصيد اللاعب في المقعد ${p.seat}`);
      }
      if (balance < ante) {
        throw new Error(`اللاعب في المقعد ${p.seat} لا يملك رصيدًا كافيًا للـ Ante`);
      }
      p.available = balance;
    }

    // First hand: the button starts at the lowest occupied seat (19.9); it
    // rotates from the next hand onward.
    this.state.dealerSeat ??= seated[0]!.seat;
    await this.dealHandFor(seated);
  }

  /**
   * Roll the room into the next hand (feature #7). Auto-invoked after a hand
   * ends (armed timer) and also safe as an explicit trigger. Re-sources every
   * present player's balance from the ledger, sits out anyone who left or can't
   * afford the ante, rotates the dealer among those who can play, then deals.
   * With fewer than 2 able players the room stays open but idle (no deal).
   */
  async startNextHand(): Promise<void> {
    if (this.startingHand) return;
    // Only between hands — never re-deal over a live hand.
    if (this.state.phase !== "ENDED" && this.state.phase !== "LOBBY") return;
    this.startingHand = true;
    try {
      this.deps.timers.clear(NEXT_HAND_KEY);
      const ante = BigInt(this.state.config.ante);
      const present = this.state.players.filter((p) => p.connected);
      const balances = await this.deps.persistence.getBalances(
        present.map((p) => p.userId),
      );
      for (const p of present) {
        const b = balances.get(p.userId);
        if (b !== undefined) p.available = b;
      }
      const eligible = present.filter((p) => (balances.get(p.userId) ?? 0n) >= ante);

      if (eligible.length < 2) {
        this.parkSession(eligible.length);
        return;
      }
      this.state.dealerSeat = this.rotateDealer(eligible.map((p) => p.seat));
      await this.dealHandFor(eligible);
    } finally {
      this.startingHand = false;
    }
  }

  /**
   * A player left (socket disconnect / explicit leave). They're dropped from the
   * next hand; between hands they're parked immediately. Mid-hand, the existing
   * turn timer auto-folds them on timeout — unchanged here.
   */
  handlePlayerLeft(seat: number): void {
    const p = this.state.players.find((x) => x.seat === seat);
    if (!p) return;
    p.connected = false;
    if (this.state.phase === "ENDED" || this.state.phase === "LOBBY") {
      this.resetHandState(p);
      p.holeCards = [];
      p.status = "WAITING";
    }
  }

  /**
   * Deal a fresh hand to `participants` (already balance-checked, dealer already
   * set): reset the per-hand latch/state, deal, post antes, open PREFLOP. Shared
   * by the first hand (start) and every rollover (startNextHand).
   */
  private async dealHandFor(participants: RoomPlayer[]): Promise<void> {
    // New hand: reset the single-resolve latch (it must hold independently per
    // hand) and bump the counter that salts repeat-prone wallet references.
    this.resolved = false;
    this.state.handNumber += 1;
    this.state.status = "IN_PROGRESS";

    // Park anyone present but not in this hand (busted / sat out) as WAITING with
    // cleared state, so they neither act nor count as committed in the pot.
    const inHand = new Set(participants);
    for (const p of this.state.players) {
      if (inHand.has(p)) continue;
      this.resetHandState(p);
      p.holeCards = [];
      if (p.connected) p.status = "WAITING";
    }

    const { hole, community } = await this.deps.cards.dealHand(
      participants.length,
      2,
      this.state.difficulty ?? "MEDIUM",
    );
    this.state.community = community;
    this.state.communityRevealed = 0;
    participants.forEach((p, i) => {
      this.resetHandState(p);
      p.holeCards = hole[i]!;
      p.status = "ACTIVE";
    });

    await this.deps.persistence.persistDeal(this.state);

    // Post antes BEFORE announcing the hand so hand:started carries the
    // authoritative post-ante betting state (each seat's committed = ante, pot,
    // currentBet). The client mirrors these exactly — it never re-derives the
    // ante — so amount-to-call/your-bet/balance match the server from turn one.
    await this.postAntes(participants);

    // Announce the new hand FIRST so clients reset the previous board/result and
    // show the rotated dealer — then deliver private hole cards, so the board
    // reset can't wipe the just-received cards.
    const ante = this.state.config.ante;
    this.deps.emitter.toRoom(SERVER_EVENTS.handStarted, {
      handNumber: this.state.handNumber,
      dealerSeat: this.state.dealerSeat,
      players: this.projectPlayers(),
      pot: ante * participants.length,
      currentBet: ante,
    });

    // Each owner privately receives their hole cards (never broadcast).
    for (const p of participants) {
      this.deps.emitter.toSeat(p.seat, SERVER_EVENTS.gameDealt, {
        holeCards: p.holeCards.map(toCardView),
      });
    }

    this.openPreflop();
  }

  /** Next dealer seat: the lowest eligible seat strictly after the current
   *  button, wrapping around (19.9 — the button rotates each hand). */
  private rotateDealer(eligibleSeats: number[]): number {
    const sorted = [...eligibleSeats].sort((a, b) => a - b);
    const cur = this.state.dealerSeat;
    if (cur === null) return sorted[0]!;
    return sorted.find((s) => s > cur) ?? sorted[0]!;
  }

  /** Reset a seat's per-hand betting + claim state (keeps wallet `available`). */
  private resetHandState(p: RoomPlayer): void {
    p.committedThisRound = 0n;
    p.committedTotal = 0n;
    p.lastBetAmount = 0n;
    p.hasActed = false;
    p.forfeit = 0n;
    p.claimRankId = null;
    p.claimValid = false;
    p.claimStrength = 0;
  }

  /** Not enough players can afford a hand: keep the room open but idle. */
  private parkSession(eligible: number): void {
    this.deps.timers.clearAll();
    for (const p of this.state.players) {
      this.resetHandState(p);
      p.holeCards = [];
      if (p.connected) p.status = "WAITING";
    }
    this.state.status = "LOBBY";
    this.state.phase = "LOBBY";
    this.state.community = [];
    this.state.communityRevealed = 0;
    this.state.currentTurnSeat = null;
    this.state.currentBet = 0n;
    this.state.turnDeadlineTs = null;
    this.deps.emitter.toRoom(SERVER_EVENTS.sessionWaiting, {
      reason: "NEED_PLAYERS",
      eligible,
    });
  }

  /** Sanitized per-seat projection for the hand:started broadcast (no hole cards). */
  private projectPlayers(): PlayerView[] {
    return this.state.players.map((p) => ({
      seat: p.seat,
      username: p.username,
      playerNumber: p.playerNumber,
      status: p.status,
      committedThisRound: Number(p.committedThisRound),
      committedTotal: Number(p.committedTotal),
      isDealer: this.state.dealerSeat === p.seat,
    }));
  }

  /**
   * FIX #4 — on (re)connect mid-hand, privately re-send a seat's own hole cards
   * to that seat only (Section 12: the private view on reconnect). Uses the
   * per-seat channel (`toSeat`), never the broadcast — so no other client ever
   * sees them. No-op if the seat hasn't been dealt (e.g. a lobby reconnect).
   */
  resyncSeat(seat: number): void {
    const player = this.state.players.find((p) => p.seat === seat);
    if (!player || player.holeCards.length === 0) return;
    this.deps.emitter.toSeat(seat, SERVER_EVENTS.gameDealt, {
      holeCards: player.holeCards.map(toCardView),
    });
  }

  /** Charge the mandatory ante (decision 19.10) for every participant, updating
   *  in-memory betting state and the ledger together. Does NOT open the round —
   *  so hand:started can be emitted with the post-ante state before the turn. */
  private async postAntes(seated: RoomPlayer[]): Promise<void> {
    const ante = BigInt(this.state.config.ante);
    const movements: LedgerMovement[] = [];
    const bets: BetRecord[] = [];
    for (const p of seated) {
      p.available -= ante;
      p.committedThisRound = ante;
      p.committedTotal += ante;
      p.lastBetAmount = ante;
      movements.push({
        userId: p.userId,
        type: "ANTE",
        amount: -ante,
        reference: `${this.state.gameId}:h${this.state.handNumber}:ante:${p.seat}`,
      });
      bets.push({ seat: p.seat, round: "PREFLOP", action: "ANTE", amount: ante });
    }
    await this.deps.persistence.applyBetting(this.state.gameId, movements, bets);
  }

  /** Open the PREFLOP betting round (antes already posted) and seat the first
   *  actor after the dealer. */
  private openPreflop(): void {
    this.state.phase = "PREFLOP";
    this.applyBettingState(openRound(this.toBettingState("PREFLOP"), "PREFLOP"));
    this.beginTurnOrAdvance();
  }

  // -- player actions ------------------------------------------------------

  /** Handle a player's betting action (the server validates turn + legality). */
  async placeAction(seat: number, action: Action): Promise<void> {
    if (this.state.currentTurnSeat !== seat) throw new Error("Not your turn");
    const bs = this.toBettingState(this.roundForPhase());

    // Reject illegal raises up front for a clean error (engine also guards).
    if (action.type === "RAISE") {
      const la = legalActions(bs, seat);
      if (!la.canRaise || (action.amount ?? 0n) < (la.minRaiseTo ?? 0n)) {
        throw new Error("Illegal raise");
      }
    }

    const { state: nextBs, movement } = applyAction(bs, seat, action);
    this.applyBettingState(nextBs);

    // Advance immediately on action (decision 19.2): clear the turn timer.
    this.deps.timers.clear(TURN_KEY);

    const player = this.player(seat);
    const movements: LedgerMovement[] = [];
    if (movement.amount > 0n) {
      const type =
        movement.action === "RAISE"
          ? "RAISE"
          : movement.action === "ALLIN"
            ? "ALLIN"
            : "BET";
      // FIX #3: the idempotency key is SERVER-generated from authoritative state
      // (gameId + seat + a monotonic server action sequence). The bump happens in
      // this synchronous section — together with the turn advance above — so a
      // duplicate/replayed emit is turn-rejected and can never double-spend.
      const reference = `${this.state.gameId}:act:${seat}:${++this.actionSeq}`;
      movements.push({
        userId: player.userId,
        type,
        amount: -movement.amount,
        reference,
      });
    }
    if (movement.action === "FOLD") {
      await this.handleFoldRefund(player);
    }

    await this.deps.persistence.applyBetting(this.state.gameId, movements, [
      {
        seat,
        round: this.roundForPhase(),
        action: movement.action,
        amount: movement.amount,
      },
    ]);

    this.deps.emitter.toRoom(SERVER_EVENTS.betPlaced, {
      seat,
      action: movement.action,
      amount: Number(movement.amount),
      pot: Number(this.potTotal()),
      pots: computeLivePots(this.state),
      currentBet: Number(this.state.currentBet),
    });
    if (movement.action === "FOLD") {
      this.deps.emitter.toRoom(SERVER_EVENTS.playerFolded, { seat });
    }

    await this.afterAction();
  }

  /** Fold accounting (Section 10): forfeit stays, refund the rest immediately. */
  private async handleFoldRefund(player: RoomPlayer): Promise<void> {
    const { forfeit, refund } = computeFold({
      round: this.roundForPhase(),
      ante: BigInt(this.state.config.ante),
      lastBetAmount: player.lastBetAmount,
      committedTotal: player.committedTotal,
    });
    player.forfeit = forfeit;
    if (refund > 0n) {
      player.available += refund;
      await this.deps.persistence.applyBetting(
        this.state.gameId,
        [
          {
            userId: player.userId,
            type: "REFUND",
            amount: refund,
            reference: `${this.state.gameId}:h${this.state.handNumber}:foldrefund:${player.seat}`,
          },
        ],
        [],
      );
    }
  }

  private async afterAction(): Promise<void> {
    const bs = this.toBettingState(this.roundForPhase());
    if (isHandOver(bs)) {
      await this.resolveHand(true);
      return;
    }
    if (isRoundComplete(bs)) {
      await this.advancePhase();
      return;
    }
    this.beginTurnOrAdvance();
  }

  // -- phase transitions ---------------------------------------------------

  private beginTurnOrAdvance(): void {
    const bs = this.toBettingState(this.roundForPhase());
    if (bs.currentTurnSeat === null) {
      // No one left to act (all-in / folded) — let the caller advance.
      void this.advancePhase();
      return;
    }
    const deadline = this.deps.clock.now() + this.state.config.turnTimerSec * 1000;
    this.state.turnDeadlineTs = deadline;
    this.deps.timers.arm(TURN_KEY, this.state.config.turnTimerSec * 1000, () => {
      void this.onTurnTimeout(bs.currentTurnSeat!);
    });
    this.deps.emitter.toRoom(SERVER_EVENTS.turnChanged, {
      seat: bs.currentTurnSeat,
      deadlineTs: deadline,
    });
  }

  /** Turn timed out (Section 9): auto-check if possible, otherwise auto-fold. */
  private async onTurnTimeout(seat: number): Promise<void> {
    if (this.state.currentTurnSeat !== seat) return;
    const la = legalActions(this.toBettingState(this.roundForPhase()), seat);
    const action: Action = la.canCheck ? { type: "CHECK" } : { type: "FOLD" };
    await this.placeAction(seat, action);
  }

  private async advancePhase(): Promise<void> {
    this.deps.timers.clear(TURN_KEY);
    switch (this.state.phase) {
      case "PREFLOP":
        await this.openStreet("FLOP", 3);
        break;
      case "FLOP":
        await this.openStreet("TURN", 4);
        break;
      case "TURN":
        await this.openStreet("RIVER", 5);
        break;
      case "RIVER":
        await this.startShowdown();
        break;
      default:
        break;
    }
  }

  private async openStreet(
    phase: "FLOP" | "TURN" | "RIVER",
    reveal: number,
  ): Promise<void> {
    this.state.phase = phase;
    this.state.communityRevealed = reveal;
    // Clear per-round commitments (committedTotal retains prior streets) and
    // open a fresh betting round on the new street.
    this.applyBettingState(clearRoundCommitments(this.toBettingState(phase)));
    this.applyBettingState(openRound(this.toBettingState(phase), phase));

    this.deps.emitter.toRoom(SERVER_EVENTS.phaseChanged, {
      phase,
      communityCards: this.revealedCommunity(),
    });

    const bs = this.toBettingState(phase);
    if (bs.currentTurnSeat === null) {
      // Everyone is all-in: run remaining streets straight to showdown.
      await this.advancePhase();
    } else {
      this.beginTurnOrAdvance();
    }
  }

  private async startShowdown(): Promise<void> {
    this.state.phase = "SHOWDOWN";
    this.state.currentTurnSeat = null;
    this.state.turnDeadlineTs = null;

    const contenders = this.contenders();
    if (contenders.length <= 1) {
      await this.resolveHand(true);
      return;
    }

    const deadline = this.deps.clock.now() + this.state.config.claimTimerSec * 1000;
    this.deps.emitter.toRoom(SERVER_EVENTS.showdownStart, {
      availableHandRanks: this.state.ranks
        .slice()
        .sort((a, b) => b.strength - a.strength)
        // nameAr is the DB-loaded display name (data-driven), not the code.
        .map((r) => ({ id: r.id, code: r.code, nameAr: r.nameAr, strength: r.strength })),
      deadlineTs: deadline,
    });
    this.deps.timers.arm(CLAIM_KEY, this.state.config.claimTimerSec * 1000, () => {
      void this.resolveHand(false);
    });
  }

  /** A contender chooses an association at showdown. */
  async selectClaim(seat: number, handRankId: string): Promise<void> {
    if (this.state.phase !== "SHOWDOWN") throw new Error("Not in showdown");
    const player = this.player(seat);
    if (player.status !== "ACTIVE" && player.status !== "ALLIN") {
      throw new Error("Not a contender");
    }
    const pool = this.poolFor(player);
    const { isValid, bestPossibleRankId } = validateClaim(
      pool,
      handRankId,
      this.state.ranks,
    );
    player.claimRankId = handRankId;
    player.claimValid = isValid;
    player.claimStrength = isValid
      ? (this.state.ranks.find((r) => r.id === handRankId)?.strength ?? 0)
      : 0;

    await this.deps.persistence.persistClaim(
      this.state.gameId,
      player,
      handRankId,
      isValid,
      bestPossibleRankId,
    );
    this.deps.emitter.toRoom(SERVER_EVENTS.claimReceived, { seat });

    // Resolve once every contender has chosen (advance immediately, 19.2).
    if (this.contenders().every((p) => p.claimRankId !== null)) {
      await this.resolveHand(false);
    }
  }

  // -- resolution ----------------------------------------------------------

  private async resolveHand(lastStanding: boolean): Promise<void> {
    // Single-resolve guard: the check + set are synchronous (no await between),
    // so the first caller latches it before yielding; any concurrent second
    // call (e.g. two simultaneous claims) bails out here. GameResults and
    // UserStats can therefore never be duplicated.
    if (this.resolved) return;
    this.resolved = true;

    this.deps.timers.clearAll();
    this.state.phase = "RESOLVE";

    const resolveSeats: ResolveSeat[] = this.state.players
      .filter((p) => p.committedTotal > 0n || p.forfeit > 0n)
      .map((p) => {
        const folded = p.status === "FOLDED";
        return {
          seat: p.seat,
          committed: folded ? 0n : p.committedTotal,
          folded,
          forfeit: folded ? p.forfeit : 0n,
          claimedValid: folded
            ? false
            : lastStanding
              ? true
              : p.claimValid,
          strength: p.claimStrength,
        };
      });

    const { settlements } = resolveShowdown(resolveSeats);

    // Reflect resolve credits in the in-memory available snapshot.
    for (const m of settlements) {
      const p = this.state.players.find((x) => x.seat === m.seat);
      if (p && m.amount > 0n && m.type !== "FOLD_FORFEIT") p.available += m.amount;
    }

    await this.deps.persistence.persistResolve(
      this.state.gameId,
      settlements,
      this.state.players,
      this.state.handNumber,
    );

    // Feature #7: the hand ends but the room/session does NOT. `phase` ENDED is
    // the inter-hand marker; `status` stays IN_PROGRESS so the room remains
    // live and players keep their seats for the next hand.
    this.state.phase = "ENDED";

    // Official reveal (SPEC §2.4): only at a real showdown (not last-standing)
    // do remaining contenders' hole cards become public — folders are NEVER
    // revealed. Card privacy holds during the hand; this is the official reveal.
    const rankNameById = (id: string | null): string | null =>
      id ? (this.state.ranks.find((r) => r.id === id)?.nameAr ?? null) : null;
    const isShowdown = !lastStanding;

    const results = this.state.players
      .filter((p) => p.committedTotal > 0n || p.forfeit > 0n)
      .map((p) => {
        const folded = p.status === "FOLDED";
        const revealed = isShowdown && !folded;
        return {
          seat: p.seat,
          outcome: outcomeFor(p, settlements),
          coinsDelta: Number(coinsDelta(p, settlements)),
          finalBalance: Number(p.available),
          // Folders have no claim context (null); otherwise expose whether the
          // showdown claim was valid so the client can explain an invalid-claim loss.
          claimValid: folded ? null : p.claimValid,
          claimedRankNameAr: folded ? null : rankNameById(p.claimRankId),
          // The WHY: engine witness → DB-named cards/attributes. Only for a
          // valid showdown claim; null for folders/invalid/last-standing.
          claimEvidence: folded || !isShowdown ? null : this.buildClaimEvidence(p),
          holeCards: revealed ? p.holeCards.map(toCardView) : null,
        };
      });

    // The winning association = the rank claimed by the winner(s) at showdown.
    const winnerSeat = settlements.find(
      (sm) => sm.type === "WIN" || sm.type === "SPLIT_WIN",
    )?.seat;
    const winner =
      winnerSeat != null ? this.state.players.find((p) => p.seat === winnerSeat) : undefined;
    const winningRankNameAr = isShowdown && winner ? rankNameById(winner.claimRankId) : null;

    this.deps.emitter.toRoom(SERVER_EVENTS.gameResult, {
      results,
      yourDelta: 0,
      newBalance: 0,
      winningRankNameAr,
    });

    // Feature #7 / Batch 1: the hand ends but the room does NOT auto-deal. It
    // waits between hands (phase ENDED) with the result on screen; the next hand
    // begins only on an explicit trigger (startNextHand, host-initiated). No
    // antes are charged without that consent.
  }

  // -- helpers -------------------------------------------------------------

  private roundForPhase(): "PREFLOP" | "FLOP" | "TURN" | "RIVER" {
    return this.state.phase as "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  }

  private player(seat: number): RoomPlayer {
    const p = this.state.players.find((x) => x.seat === seat);
    if (!p) throw new Error(`No player at seat ${seat}`);
    return p;
  }

  /** Players still eligible to win at showdown (not folded, in the hand). */
  private contenders(): RoomPlayer[] {
    return this.state.players.filter(
      (p) => p.status === "ACTIVE" || p.status === "ALLIN",
    );
  }

  /**
   * The truly distributable pot (FIX #11): a folded player already had
   * (committed − forfeit) refunded, so only their forfeit remains in the pot —
   * not their full pre-refund committed total. Mirrors the side-pot build.
   */
  private potTotal(): bigint {
    return this.state.players.reduce(
      (sum, p) => sum + (p.status === "FOLDED" ? p.forfeit : p.committedTotal),
      0n,
    );
  }

  private revealedCommunity() {
    return this.state.community
      .slice(0, this.state.communityRevealed)
      .map(toCardView);
  }

  /** The 7-card evaluation pool for a player (hole + revealed community). */
  private poolFor(player: RoomPlayer): Card[] {
    return this.dealtPoolFor(player).map((c) => ({
      nationality: c.nationality,
      position: c.position,
      clubs: c.clubs,
    }));
  }

  /** The same pool as `poolFor`, but the full DealtCards (names, positionNameAr)
   *  so witness indices map back to display data. Same order as `poolFor`. */
  private dealtPoolFor(player: RoomPlayer): DealtCard[] {
    return [...player.holeCards, ...this.state.community];
  }

  /**
   * Build the data-driven explanation of a player's *valid* claim from the
   * engine's witness: the engine says which cards and shared token satisfy each
   * leaf; we name them from the DB-loaded cards. No rank logic here, and no
   * hardcoded football data. Null unless the player holds a valid claim.
   */
  private buildClaimEvidence(player: RoomPlayer): ClaimEvidenceGroup[] | null {
    if (!player.claimRankId || !player.claimValid) return null;
    const rank = this.state.ranks.find((r) => r.id === player.claimRankId);
    if (!rank) return null;
    const dealt = this.dealtPoolFor(player);
    const pool: Card[] = dealt.map((c) => ({
      nationality: c.nationality,
      position: c.position,
      clubs: c.clubs,
    }));
    const groups = explainRank(rank.rule, pool);
    return groups ? groups.map((g) => toEvidenceGroup(g, dealt)) : null;
  }

  /** Project the room players into the engine's betting state. */
  private toBettingState(round: "PREFLOP" | "FLOP" | "TURN" | "RIVER"): BettingState {
    const seats: BettingSeat[] = this.state.players
      .filter((p) => p.status !== "WAITING" && p.status !== "DISCONNECTED")
      .map((p) => ({
        seat: p.seat,
        status: p.status === "FOLDED" ? "FOLDED" : p.status === "ALLIN" ? "ALLIN" : "ACTIVE",
        available: p.available,
        committedThisRound: p.committedThisRound,
        committedTotal: p.committedTotal,
        lastBetAmount: p.lastBetAmount,
        hasActed: p.hasActed,
      }));
    return {
      seats,
      dealerSeat: this.state.dealerSeat ?? seats[0]?.seat ?? 0,
      round,
      currentBet: this.state.currentBet,
      minRaise: BigInt(this.state.config.minRaise),
      currentTurnSeat: this.state.currentTurnSeat,
    };
  }

  /** Merge an engine betting state back onto the room players. */
  private applyBettingState(bs: BettingState): void {
    for (const s of bs.seats) {
      const p = this.player(s.seat);
      p.status = s.status;
      p.available = s.available;
      p.committedThisRound = s.committedThisRound;
      p.committedTotal = s.committedTotal;
      p.lastBetAmount = s.lastBetAmount;
      p.hasActed = s.hasActed;
    }
    this.state.currentBet = bs.currentBet;
    this.state.currentTurnSeat = bs.currentTurnSeat;
  }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

/**
 * Layered pots for DISPLAY (A4). With no all-in there is a single pot, so we
 * return one entry (the distributable total). Once any seat is all-in, real
 * side pots exist, so we expose the layered breakdown via the same engine
 * `buildSidePots` used at resolve. Display-only — settlement still uses resolve.
 */
export function computeLivePots(state: RoomState): PotView[] {
  const nonFolded = state.players
    .filter((p) => p.status === "ACTIVE" || p.status === "ALLIN")
    .map((p) => p.seat);
  const total = state.players.reduce(
    (sum, p) => sum + (p.status === "FOLDED" ? p.forfeit : p.committedTotal),
    0n,
  );
  if (!state.players.some((p) => p.status === "ALLIN")) {
    return [{ amount: Number(total), eligibleSeats: nonFolded }];
  }
  const potSeats: PotSeat[] = state.players
    .filter((p) => p.committedTotal > 0n || p.forfeit > 0n)
    .map((p) => {
      const folded = p.status === "FOLDED";
      return {
        seat: p.seat,
        committed: folded ? 0n : p.committedTotal,
        folded,
        forfeit: folded ? p.forfeit : 0n,
      };
    });
  return buildSidePots(potSeats).map((sp) => ({
    amount: Number(sp.amount),
    eligibleSeats: sp.eligibleSeats,
  }));
}

function toCardView(c: DealtCard) {
  return {
    playerId: c.playerId,
    name: c.name,
    nameAr: c.nameAr ?? null,
    nationality: c.nationality,
    position: c.position,
    clubs: [...c.clubs],
    photoUrl: c.photoUrl,
    fameScore: c.fameScore ?? null,
  };
}

/**
 * Map one engine WitnessGroup to the wire shape, naming cards and resolving the
 * shared value to its DB display: position → Arabic name (positions.name_ar,
 * falling back to the code if unseeded); nationality/club → their stored DB
 * name. The Arabic attribute label is fixed game vocabulary, not football data.
 */
function toEvidenceGroup(g: WitnessGroup, dealt: DealtCard[]): ClaimEvidenceGroup {
  const players = g.cardIndices.map((i) => ({
    nameAr: dealt[i]!.nameAr ?? null,
    nameEn: dealt[i]!.name,
  }));

  if (g.attribute === "position") {
    const head = dealt[g.cardIndices[0]!]!;
    return {
      attribute: "position",
      attributeLabelAr: "نفس المركز",
      value: head.positionNameAr ?? g.value,
      players,
    };
  }
  if (g.attribute === "nationality") {
    return {
      attribute: "nationality",
      attributeLabelAr: "نفس الجنسية",
      value: g.value,
      players,
    };
  }
  // club
  if (g.match === "identical") {
    const clubs = [...dealt[g.cardIndices[0]!]!.clubs];
    return {
      attribute: "club",
      attributeLabelAr: "نفس مجموعة الأندية",
      value: clubs.join("، "),
      values: clubs,
      players,
    };
  }
  return {
    attribute: "club",
    attributeLabelAr: "نادي مشترك",
    value: g.value,
    players,
  };
}

function seatNet(
  seat: number,
  settlements: readonly { seat: number; type: string; amount: bigint }[],
): bigint {
  return settlements
    .filter((m) => m.seat === seat)
    .reduce((sum, m) => sum + m.amount, 0n);
}

/** Net coins change for the seat across the whole hand. */
function coinsDelta(
  p: RoomPlayer,
  settlements: readonly { seat: number; type: string; amount: bigint }[],
): bigint {
  const foldRefund = p.status === "FOLDED" ? p.committedTotal - p.forfeit : 0n;
  return seatNet(p.seat, settlements) + foldRefund - p.committedTotal;
}

function outcomeFor(
  p: RoomPlayer,
  settlements: readonly { seat: number; type: string; amount: bigint }[],
): "WIN" | "SPLIT" | "LOSE" | "FOLD" | "REFUND" {
  if (p.status === "FOLDED") return "FOLD";
  const mine = settlements.filter((m) => m.seat === p.seat);
  if (mine.some((m) => m.type === "SPLIT_WIN")) return "SPLIT";
  if (mine.some((m) => m.type === "WIN")) return "WIN";
  if (mine.some((m) => m.type === "REFUND")) return "REFUND";
  return "LOSE";
}
