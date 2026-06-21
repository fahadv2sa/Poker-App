import {
  applyAction,
  bestAchievableRank,
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
  type HandRankDef,
  type LegalActions,
  type PotSeat,
  type ResolveSeat,
  type WitnessGroup,
} from "@fp/engine";
import {
  BLUFF_BET_TO_POT,
  SERVER_EVENTS,
  WEAK_RANK_MAX_STRENGTH,
  type BestRankPayload,
  type PlayEventType,
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
  PlayEventRecord,
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
  /**
   * OPTIONAL Quick Play bot driver. When a bot seat's turn opens, the room hands
   * it to this port, which schedules a human-like delayed action via
   * `placeAction`. Undefined in the base game (and whenever no bot is seated), so
   * the seam is completely inert — the entire bot feature can be removed by
   * deleting `src/bots/`, this field, and the single call site below. The port is
   * defined here (not in ports.ts) because it references GameRoom; ports.ts must
   * not import room.ts.
   */
  bots?: BotPort;
}

/** Optional bot turn-driver (see RoomDeps.bots). Implemented by src/bots. */
export interface BotPort {
  /** Invoked only for a bot seat when its turn opens, with the server's turn
   *  deadline (epoch ms). The implementation must apply via `room.placeAction`. */
  onTurn(room: GameRoom, seat: number, deadlineTs: number): void;
  /** Drop any scheduled actions for a room (called on hand/room teardown). */
  cancel?(gameId: string): void;
}

/** The read-only decision inputs a bot needs for its turn, assembled from the
 *  SAME private helpers the engine path uses (no logic duplication). Returned by
 *  `GameRoom.botTurnView`. `strength`/`potOdds` are derived by the bot module so
 *  room.ts stays free of any dependency on src/bots. */
export interface BotTurnView {
  legal: LegalActions;
  pool: Card[];
  ranks: HandRankDef[];
  street: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  pot: bigint;
}

const TURN_KEY = "turn";
const CLAIM_KEY = "claim";
const NEXT_HAND_KEY = "nexthand";

/** Phases in which a hand is genuinely live with coins committed to the pot —
 *  closing during one must refund those stakes. LOBBY/ENDED hold no live pot
 *  (ENDED = a just-resolved hand whose money is already settled). */
const LIVE_HAND_PHASES = new Set(["PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"]);

/**
 * A bot's FAKE virtual stack each hand is CALIBRATED to the humans at the table so
 * a bot never out-chips / over-pressures them: it equals the largest human stack,
 * clamped to [BOT_MIN_STACK, BOT_MAX_STACK]. The band tracks the human economy — a
 * 1000 floor (≈ a fresh signup balance) and a ceiling ≈ signup 1000 + the 2000/24h
 * bank cap — so bots can't bet amounts a normal human couldn't have. Re-derived
 * every hand (humans' real balances change); never sourced from / written to the
 * wallet ledger. Only ever applied to `isBot` seats. Tunable.
 */
const BOT_MIN_STACK = 1000n;
const BOT_MAX_STACK = 3000n;

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

  /** Stats Layer 1: lightweight play events buffered in MEMORY during the hand
   *  (zero added I/O in the betting hot path) and flushed once at resolve, where
   *  the post-match aggregation also runs. Reset at the start of every hand. */
  private pendingEvents: PlayEventRecord[] = [];

  /** Single-resolve latch: a hand resolves exactly once even if concurrent
   *  claims both pass the "all claimed" check. Prevents duplicate
   *  GameResults/UserStats (the wallet is also idempotent). Reset at the start
   *  of every hand (feature #7) so the guard holds independently per hand. */
  private resolved = false;

  /** Re-entrancy latch around the async hand setup (deal/antes): blocks a second
   *  startNextHand (e.g. auto-timer racing an explicit trigger) from double-dealing. */
  private startingHand = false;

  /** Close latches: `closing` blocks a concurrent close mid-await; `closed` makes
   *  close() a permanent no-op once done (host-close racing the auto-empty cleanup). */
  private closing = false;
  private closed = false;

  /** True once the room has been closed (its hand refunded, status ABANDONED). */
  get isClosed(): boolean {
    return this.closed;
  }

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
    // Only humans are sourced/validated against the wallet ledger.
    const humans = seated.filter((p) => !p.isBot);
    const balances = await this.deps.persistence.getBalances(
      humans.map((p) => p.userId),
    );
    for (const p of humans) {
      const balance = balances.get(p.userId);
      if (balance === undefined) {
        throw new Error(`تعذّر قراءة رصيد اللاعب في المقعد ${p.seat}`);
      }
      if (balance < ante) {
        throw new Error(`اللاعب في المقعد ${p.seat} لا يملك رصيدًا كافيًا للـ Ante`);
      }
      p.available = balance;
    }
    // Bots get a fake stack calibrated to the humans (never out-chipping them).
    const botStack = this.botStackFor(humans);
    for (const p of seated) if (p.isBot) p.available = botStack;

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
      // Humans are re-sourced from the wallet; bots get a fresh fake stack
      // calibrated to the humans (always eligible; coins never touch the ledger).
      const humans = present.filter((p) => !p.isBot);
      const balances = await this.deps.persistence.getBalances(
        humans.map((p) => p.userId),
      );
      for (const p of humans) {
        const b = balances.get(p.userId);
        if (b !== undefined) p.available = b;
      }
      const botStack = this.botStackFor(humans);
      for (const p of present) if (p.isBot) p.available = botStack;
      const eligible = present.filter(
        (p) => p.isBot || (balances.get(p.userId) ?? 0n) >= ante,
      );

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
    // Host transfer: if the host leaves but others remain, hand authority to the
    // lowest-seat still-connected player. (If nobody connected remains, the
    // socket layer auto-closes the room — so the host id can stay as-is here.)
    if (p.userId === this.state.hostUserId) {
      const next = this.state.players
        .filter((x) => x.connected && x.userId !== p.userId)
        .sort((a, b) => a.seat - b.seat)[0];
      if (next) this.state.hostUserId = next.userId;
    }
  }

  /**
   * Close the room for good (host "Close Table", or auto-cleanup when it empties).
   * Safely VOIDS any live hand rather than resolving it: every contributor's
   * still-committed stake is refunded — `committedTotal` for a non-folder, the
   * remaining `forfeit` for a folder (the rest was already refunded at fold). That
   * sum is exactly the pot, so the hand nets to zero with no winner and no
   * FOLD_FORFEIT sink. Refunds + the ABANDONED status flip commit in one DB
   * transaction (ledger row locks + idempotency). Idempotent and latched, so a
   * host-close racing the empty-room cleanup runs the money path exactly once.
   */
  async close(): Promise<void> {
    if (this.closed || this.closing) return;
    this.closing = true;
    try {
      this.deps.timers.clearAll();

      // Compute refunds WITHOUT mutating wallet state yet, so a retry after a
      // persistence failure can't double-credit (the ledger reference is also
      // idempotent as a second line of defense).
      const refunds: LedgerMovement[] = [];
      const refundBySeat = new Map<number, bigint>();
      if (!this.resolved && LIVE_HAND_PHASES.has(this.state.phase)) {
        for (const p of this.state.players) {
          if (p.isBot) continue; // bot stakes are fake — nothing to refund
          const stake = p.status === "FOLDED" ? p.forfeit : p.committedTotal;
          if (stake > 0n) {
            refundBySeat.set(p.seat, stake);
            refunds.push({
              userId: p.userId,
              type: "REFUND",
              amount: stake,
              reference: `${this.state.gameId}:h${this.state.handNumber}:abortrefund:${p.seat}`,
            });
          }
        }
      }

      await this.deps.persistence.closeGame(
        this.state.gameId,
        refunds,
        this.state.handNumber,
      );

      // Persistence committed — now reflect refunds in memory and tear the hand
      // down to a clean, inert ABANDONED state.
      for (const p of this.state.players) {
        p.available += refundBySeat.get(p.seat) ?? 0n;
        this.resetHandState(p);
        p.holeCards = [];
      }
      this.state.status = "ABANDONED";
      this.state.phase = "ENDED";
      this.state.community = [];
      this.state.communityRevealed = 0;
      this.state.currentTurnSeat = null;
      this.state.currentBet = 0n;
      this.state.turnDeadlineTs = null;
      // Free this table's shuffled deck (single-deck no-repeat state).
      this.deps.cards.releaseTable(this.state.gameId);
      this.closed = true;
    } finally {
      this.closing = false;
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
    this.pendingEvents = [];
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
      this.state.gameId,
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

  /** A bot's fake stack for the hand: the largest human stack at the table,
   *  clamped to [BOT_MIN_STACK, BOT_MAX_STACK] so bots never out-chip the humans
   *  (or bet amounts a normal human couldn't have). Humans must be sourced first. */
  private botStackFor(humans: readonly RoomPlayer[]): bigint {
    let maxHuman = 0n;
    for (const p of humans) if (p.available > maxHuman) maxHuman = p.available;
    if (maxHuman < BOT_MIN_STACK) return BOT_MIN_STACK;
    if (maxHuman > BOT_MAX_STACK) return BOT_MAX_STACK;
    return maxHuman;
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

  /**
   * Bot-only: the decision inputs for the seat whose turn it is, built from the
   * SAME private helpers the engine path uses (no duplicated betting/pool logic).
   * Returns null unless it is genuinely `seat`'s turn. Display/decision inputs
   * only — never mutates state. Used solely by the optional BotController; safe to
   * delete along with the bot feature.
   */
  botTurnView(seat: number): BotTurnView | null {
    if (this.state.currentTurnSeat !== seat) return null;
    if (!this.state.players.some((p) => p.seat === seat)) return null;
    const street = this.roundForPhase();
    return {
      legal: legalActions(this.toBettingState(street), seat),
      pool: this.poolFor(this.player(seat)),
      ranks: this.state.ranks,
      street,
      pot: this.potTotal(),
    };
  }

  /** Charge the mandatory ante (decision 19.10) for every participant, updating
   *  in-memory betting state and the ledger together. Does NOT open the round —
   *  so hand:started can be emitted with the post-ante state before the turn. */
  private async postAntes(seated: RoomPlayer[]): Promise<void> {
    const ante = BigInt(this.state.config.ante);
    const movements: LedgerMovement[] = [];
    const bets: BetRecord[] = [];
    for (const p of seated) {
      // In-memory ante for EVERY seat (incl. bots) so the pot/betting math is
      // correct and the human-facing pot looks real.
      p.available -= ante;
      p.committedThisRound = ante;
      p.committedTotal += ante;
      p.lastBetAmount = ante;
      // A bot's ante is fake: it never hits the ledger or the Bets log.
      if (p.isBot) continue;
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

    // Stats Layer 1 (captured BEFORE the bet mutates the pot): pot-before for the
    // bet/pot ratio, the street, and the decision time. In-memory only.
    const potBefore = Number(this.potTotal());
    const street = this.roundForPhase();
    const turnStartTs =
      this.state.turnDeadlineTs != null
        ? this.state.turnDeadlineTs - this.state.config.turnTimerSec * 1000
        : null;
    const responseMs =
      turnStartTs != null ? Math.max(0, this.deps.clock.now() - turnStartTs) : null;

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
    // A bot's wager is fake — it updates the in-memory betting state (applied
    // above) but never produces a ledger movement or a Bets row.
    if (!player.isBot && movement.amount > 0n) {
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

    const bets: BetRecord[] = player.isBot
      ? []
      : [
          {
            seat,
            round: this.roundForPhase(),
            action: movement.action,
            amount: movement.amount,
          },
        ];
    await this.deps.persistence.applyBetting(this.state.gameId, movements, bets);

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

    // Buffer the lightweight Layer-1 event (memory push; no I/O in the hot path).
    // Bots are excluded — their play is never recorded in stats/XP/badges.
    if (!player.isBot) {
      this.pendingEvents.push({
        playerId: player.userId,
        gameId: this.state.gameId,
        handNumber: this.state.handNumber,
        type: movement.action as PlayEventType,
        value: Number(movement.amount),
        metadata: {
          seat,
          street,
          potBefore,
          betToPot: potBefore > 0 ? Number(movement.amount) / potBefore : 0,
          responseMs,
        },
      });
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
      // In-memory refund for every seat (keeps the distributable pot correct).
      player.available += refund;
      // A bot's refund is fake — it never hits the ledger.
      if (player.isBot) return;
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
    // Bot seam: if the seat to act is a Quick Play bot, hand it to the optional
    // controller (which schedules a human-like delayed placeAction). Inert for
    // humans and whenever no controller is injected — the base game is unaffected.
    const actor = this.state.players.find((p) => p.seat === bs.currentTurnSeat);
    if (actor?.isBot) this.deps.bots?.onTurn(this, bs.currentTurnSeat, deadline);
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

    // AUTO mode (table-level, server-authoritative): evaluate each contender's
    // strongest rank with the SAME engine evaluator and resolve immediately —
    // no self-declaration, no claim UI, no claim timer. Outcome = highest actual
    // rank (ties split); a contender with no qualifying rank can't win. The
    // per-seat best-rank reveal still fires from resolveHand, as in MANUAL.
    if (this.state.config.resolveMode === "AUTO") {
      for (const p of contenders) {
        const best = bestAchievableRank(this.poolFor(p), this.state.ranks);
        p.claimRankId = best?.id ?? null;
        p.claimValid = best != null;
        p.claimStrength = best?.strength ?? 0;
      }
      await this.resolveHand(false);
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

    // Reflect resolve credits in the in-memory available snapshot (every seat,
    // incl. bots — a bot's stack is fake but kept consistent for the session).
    for (const m of settlements) {
      const p = this.state.players.find((x) => x.seat === m.seat);
      if (p && m.amount > 0n && m.type !== "FOLD_FORFEIT") p.available += m.amount;
    }

    // ISOLATION (Phase 2): only HUMAN seats are persisted. A human winner's
    // WIN/SPLIT_WIN credit is its share of the FULL pot — which already includes
    // the bots' fake contributions — so the bot-funded portion is minted to the
    // human through the normal, idempotent ledger credit, with no special path.
    // Bot settlements (and bot GameResults/UserStats) are dropped entirely: their
    // coins are fake and recorded nowhere. The engine math above still used every
    // seat, so pots/side-pots/winners are computed correctly.
    const botSeats = new Set(
      this.state.players.filter((p) => p.isBot).map((p) => p.seat),
    );
    const humanPlayers = this.state.players.filter((p) => !p.isBot);
    const humanSettlements = settlements.filter((s) => !botSeats.has(s.seat));

    await this.deps.persistence.persistResolve(
      this.state.gameId,
      humanSettlements,
      humanPlayers,
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

    // Winner-screen reveal: each dealt player's OWN strongest achievable rank,
    // sent PRIVATELY per seat (toSeat) so a folder sees their own combination
    // without exposing their cards to anyone else. Display only — computed by the
    // same evaluator as the winner logic, never affects the outcome above.
    //
    // MANUAL-only suggestion: it guides each player's self-declaration. In AUTO
    // the server already evaluated + resolved the ranks, so no suggestion is
    // shown — we simply skip the emit (the automatic evaluation in startShowdown
    // is unaffected; this is purely the on-screen aid). The mode is fixed per
    // table, so there is never a stale reveal from a different mode.
    for (const p of this.state.config.resolveMode === "MANUAL" ? this.state.players : []) {
      if (p.holeCards.length === 0) continue; // not dealt this hand
      this.deps.emitter.toSeat(p.seat, SERVER_EVENTS.bestRank, this.buildBestRank(p));
    }

    // Stats: flush the hand's Layer-1 events + run aggregation. AFTER the result
    // emit (players already saw the outcome) and fully guarded — a stats failure
    // must never affect the game. This is the only place aggregation runs.
    try {
      await this.flushHandStats(settlements, isShowdown);
    } catch (err) {
      console.error("[stats] hand aggregation failed", err);
    }

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
  /**
   * The player's STRONGEST achievable rank from their final 7-card pool, for the
   * private winner-screen reveal. Reuses the same evaluator as the winner logic
   * (`bestAchievableRank`/`explainRank`) — never re-implements rank rules and
   * never changes the outcome. `rankNameAr` is null when no rank qualifies; the
   * `cards` are exactly the witness cards that formed the rank.
   */
  private buildBestRank(player: RoomPlayer): BestRankPayload {
    const dealt = this.dealtPoolFor(player);
    const pool: Card[] = dealt.map((c) => ({
      nationality: c.nationality,
      position: c.position,
      clubs: c.clubs,
    }));
    const best = bestAchievableRank(pool, this.state.ranks);
    if (!best) return { rankNameAr: null, evidence: null, cards: [] };
    const groups = explainRank(best.rule, pool);
    const evidence = groups ? groups.map((g) => toEvidenceGroup(g, dealt)) : null;
    const cardIdx = groups
      ? [...new Set(groups.flatMap((g) => g.cardIndices))].sort((a, b) => a - b)
      : [];
    return {
      rankNameAr: this.state.ranks.find((r) => r.id === best.id)?.nameAr ?? null,
      evidence,
      cards: cardIdx.map((i) => toCardView(dealt[i]!)),
    };
  }

  /**
   * Stats: build the per-player ROUND_SUMMARY events for the just-resolved hand,
   * flush them (plus the buffered bet events) to the append-only log, and run the
   * incremental aggregation. Reuses the SAME evaluator as the winner/best-rank
   * path (bestAchievableRank) — display/analytics only, never the outcome.
   */
  private async flushHandStats(
    settlements: readonly { seat: number; type: string; amount: bigint }[],
    isShowdown: boolean,
  ): Promise<void> {
    // Bots are excluded entirely: no ROUND_SUMMARY, no metrics/badges/XP for them.
    const dealt = this.state.players.filter((p) => p.holeCards.length > 0 && !p.isBot);
    if (dealt.length === 0) return;

    const pot = Number(this.potTotal());
    // Dealt-hand strength proxy = avg of the two hole cards' fame (0–1).
    const strengthOf = (p: RoomPlayer): number => {
      const f = p.holeCards.map((c) => c.fameScore ?? 0);
      return f.length ? f.reduce((a, b) => a + b, 0) / f.length / 100 : 0;
    };
    const strengths = new Map(dealt.map((p) => [p.seat, strengthOf(p)]));
    const roundAvg = [...strengths.values()].reduce((a, b) => a + b, 0) / dealt.length;

    const summaries: PlayEventRecord[] = dealt.map((p) => {
      const delta = Number(coinsDelta(p, settlements));
      const outcome = outcomeFor(p, settlements);
      const folded = p.status === "FOLDED";
      const won = outcome === "WIN" || outcome === "SPLIT";
      const contender = p.status === "ACTIVE" || p.status === "ALLIN";
      const rankStrength = folded
        ? 0
        : (bestAchievableRank(this.poolFor(p), this.state.ranks)?.strength ?? 0);
      const ratios = this.pendingEvents
        .filter((e) => e.playerId === p.userId && (e.value ?? 0) > 0)
        .map((e) => Number((e.metadata as { betToPot?: number } | null)?.betToPot ?? 0));
      const maxBetToPot = ratios.length ? Math.max(...ratios) : 0;
      const weak = rankStrength <= WEAK_RANK_MAX_STRENGTH;
      const isBluff = maxBetToPot >= BLUFF_BET_TO_POT && weak;
      const myStrength = strengths.get(p.seat) ?? 0;
      return {
        playerId: p.userId,
        gameId: this.state.gameId,
        handNumber: this.state.handNumber,
        type: "ROUND_SUMMARY" as PlayEventType,
        value: delta,
        metadata: {
          outcome,
          folded,
          showdown: isShowdown && contender,
          rankStrength,
          dealtStrength: myStrength,
          luck: myStrength - roundAvg,
          maxBetToPot,
          betToPotSum: ratios.reduce((a, b) => a + b, 0),
          betActionCount: ratios.length,
          isBluff,
          bluffWon: isBluff && won,
          weakWon: won && weak,
          pot,
        },
      };
    });

    const events = [...this.pendingEvents, ...summaries];
    this.pendingEvents = [];
    await this.deps.persistence.recordPlayEvents(events);
    await this.deps.persistence.aggregatePlayers(dealt.map((p) => p.userId));
  }

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
