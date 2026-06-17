import type {
  BetPlacedPayload,
  CardView,
  GameResultPayload,
  ShowdownStartPayload,
  StateSyncPayload,
} from "@fp/shared";

/**
 * Pure, framework-free table view model + the reducers/selectors the live table
 * uses. Kept out of the React hook so it can be unit-tested directly (e.g. the
 * per-seat "is it my turn" logic, including the seat-1/host case). The server is
 * always authoritative; this only folds the events it emits into a render model.
 */
/** A transient on-screen notice (action notifications, opponent-left, reconnect). */
export interface Notice {
  id: number;
  text: string;
  kind: "action" | "system";
}

export interface TableView {
  connected: boolean;
  state: StateSyncPayload | null;
  hole: CardView[];
  showdown: ShowdownStartPayload | null;
  result: GameResultPayload | null;
  /** Seats that have submitted a showdown claim this hand (A3). */
  claimedSeats: number[];
  /** Auto-dismissing notices shown at the top of the table (A6, C10). */
  notices: Notice[];
  /** Authoritative wallet balance from the last hand's result (feature #7). */
  balance: number | null;
  /** True between hands when the room can't deal (fewer than 2 can ante). */
  waiting: boolean;
  error: string | null;
}

export const INITIAL_VIEW: TableView = {
  connected: false,
  state: null,
  hole: [],
  showdown: null,
  result: null,
  claimedSeats: [],
  notices: [],
  balance: null,
  waiting: false,
  error: null,
};

const BETTING_PHASES = new Set(["PREFLOP", "FLOP", "TURN", "RIVER"]);

/**
 * Fold a `state:sync` into the view. CRITICAL: the server broadcasts a sanitized
 * state:sync to OTHER players when someone joins, with `yourSeat: null` (it can't
 * address each room member's own seat in one broadcast). We must NOT let that
 * clobber a seat we already know — otherwise the already-seated player (e.g. the
 * host in seat 1) loses its identity and can never see its action controls. So a
 * null incoming `yourSeat` keeps the previously known seat.
 */
export function applyStateSync(view: TableView, payload: StateSyncPayload): TableView {
  const yourSeat = payload.yourSeat ?? view.state?.yourSeat ?? null;
  return { ...view, state: { ...payload, yourSeat } };
}

/** The seat the local player occupies, or null. */
export function mySeat(view: TableView): number | null {
  return view.state?.yourSeat ?? null;
}

/** True iff it is the local player's turn to act in a betting round. Works for
 *  every seat including seat 1 / the host (regression-guarded by tests). */
export function isMyTurn(view: TableView): boolean {
  const s = view.state;
  if (!s || s.yourSeat == null) return false;
  if (!BETTING_PHASES.has(s.phase)) return false;
  const me = s.players.find((p) => p.seat === s.yourSeat);
  return me != null && s.currentTurnSeat === s.yourSeat;
}

/** Whether the local player is a showdown contender (must pick an association). */
export function isContender(view: TableView): boolean {
  const s = view.state;
  if (!s || s.yourSeat == null) return false;
  const me = s.players.find((p) => p.seat === s.yourSeat);
  return me?.status === "ACTIVE" || me?.status === "ALLIN";
}

/** Arabic, table-wide notification text for a player's action (C10). */
export function actionNotice(name: string, p: BetPlacedPayload): string {
  switch (p.action) {
    case "CHECK":
      return `${name} مرّر`;
    case "CALL":
      return `${name} ساوى ${p.amount}`;
    case "RAISE":
      return `${name} رفع إلى ${p.currentBet}`;
    case "ALLIN":
      return `${name} دخل بكل رصيده (${p.amount})`;
    case "FOLD":
      return `${name} انسحب`;
    default:
      return `${name} راهن ${p.amount}`;
  }
}
