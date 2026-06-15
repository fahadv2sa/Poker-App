import {
  applyAction,
  clearRoundCommitments,
  computeFold,
  isHandOver,
  isRoundComplete,
  legalActions,
  openRound,
  resolveShowdown,
  validateClaim,
  type Action,
  type BettingSeat,
  type BettingState,
  type Card,
  type ResolveSeat,
} from "@fp/engine";
import { SERVER_EVENTS } from "@fp/shared";
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

  constructor(
    readonly state: RoomState,
    private readonly deps: RoomDeps,
  ) {}

  // -- lifecycle -----------------------------------------------------------

  /** Host starts the hand: deal, post antes, open PREFLOP. (≥2 players.) */
  async start(): Promise<void> {
    const seated = this.state.players.filter((p) => p.status !== "DISCONNECTED");
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

    this.state.status = "IN_PROGRESS";
    this.state.dealerSeat ??= seated[0]!.seat;

    const { hole, community } = await this.deps.cards.dealHand(
      seated.length,
      2,
    );
    this.state.community = community;
    this.state.communityRevealed = 0;
    seated.forEach((p, i) => {
      p.holeCards = hole[i]!;
      p.status = "ACTIVE";
      p.committedThisRound = 0n;
      p.committedTotal = 0n;
      p.lastBetAmount = 0n;
      p.hasActed = false;
      p.claimRankId = null;
      p.claimValid = false;
      p.claimStrength = 0;
      p.forfeit = 0n;
    });

    await this.deps.persistence.persistDeal(this.state);

    // Each owner privately receives their hole cards (never broadcast).
    for (const p of seated) {
      this.deps.emitter.toSeat(p.seat, SERVER_EVENTS.gameDealt, {
        holeCards: p.holeCards.map(toCardView),
      });
    }

    await this.postAntesAndOpenPreflop(seated);
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

  private async postAntesAndOpenPreflop(seated: RoomPlayer[]): Promise<void> {
    const ante = BigInt(this.state.config.ante);
    const movements: LedgerMovement[] = [];
    const bets: BetRecord[] = [];
    for (const p of seated) {
      // Mandatory opening bet (decision 19.10): every player posts the ante.
      p.available -= ante;
      p.committedThisRound = ante;
      p.committedTotal += ante;
      p.lastBetAmount = ante;
      movements.push({
        userId: p.userId,
        type: "ANTE",
        amount: -ante,
        reference: `${this.state.gameId}:ante:${p.seat}`,
      });
      bets.push({ seat: p.seat, round: "PREFLOP", action: "ANTE", amount: ante });
    }
    await this.deps.persistence.applyBetting(this.state.gameId, movements, bets);

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
            reference: `${this.state.gameId}:foldrefund:${player.seat}`,
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
    );

    this.state.phase = "ENDED";
    this.state.status = "ENDED";

    const results = this.state.players
      .filter((p) => p.committedTotal > 0n || p.forfeit > 0n)
      .map((p) => ({
        seat: p.seat,
        outcome: outcomeFor(p, settlements),
        coinsDelta: Number(coinsDelta(p, settlements)),
        finalBalance: Number(p.available),
      }));
    this.deps.emitter.toRoom(SERVER_EVENTS.gameResult, {
      results,
      yourDelta: 0,
      newBalance: 0,
    });
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

  private potTotal(): bigint {
    return this.state.players.reduce((sum, p) => sum + p.committedTotal, 0n);
  }

  private revealedCommunity() {
    return this.state.community
      .slice(0, this.state.communityRevealed)
      .map(toCardView);
  }

  /** The 7-card evaluation pool for a player (hole + revealed community). */
  private poolFor(player: RoomPlayer): Card[] {
    return [...player.holeCards, ...this.state.community].map((c) => ({
      nationality: c.nationality,
      position: c.position,
      clubs: c.clubs,
    }));
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

function toCardView(c: DealtCard) {
  return {
    playerId: c.playerId,
    name: c.name,
    nationality: c.nationality,
    position: c.position,
    clubs: [...c.clubs],
    photoUrl: c.photoUrl,
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
