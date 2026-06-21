import type { BetPlacedPayload, PlayerView, StateSyncPayload } from "@fp/shared";
import { describe, expect, it } from "vitest";
import {
  actionNotice,
  applyStateSync,
  INITIAL_VIEW,
  isContender,
  isMyTurn,
  mySeat,
  type TableView,
} from "./tableView";

/**
 * Client turn/seat logic — the layer that was broken for seat 1 / the host.
 * Root cause guarded here: a broadcast state:sync (another player joining) carries
 * yourSeat=null and must NOT erase the seat we already hold.
 */

const pv = (seat: number, status: PlayerView["status"], isDealer = false): PlayerView => ({
  seat,
  username: `u${seat}`,
  playerNumber: 100_000 + seat,
  status,
  committedThisRound: 50,
  committedTotal: 50,
  isDealer,
});

function sync(over: Partial<StateSyncPayload> = {}): StateSyncPayload {
  return {
    gameId: "g1",
    roomName: "R",
    phase: "PREFLOP",
    status: "IN_PROGRESS",
    players: [pv(1, "ACTIVE", true), pv(2, "ACTIVE")],
    communityCards: [],
    pot: 100,
    pots: [{ amount: 100, eligibleSeats: [1, 2] }],
    currentBet: 50,
    dealerSeat: 1,
    currentTurnSeat: 1,
    turnDeadlineTs: null,
    yourSeat: null,
    hostSeat: 1,
    ...over,
  };
}

const viewWith = (over: Partial<StateSyncPayload>): TableView =>
  applyStateSync(INITIAL_VIEW, sync(over));

describe("applyStateSync preserves the local seat (PROBLEM 1 regression)", () => {
  it("keeps a known yourSeat when a broadcast sync arrives with yourSeat=null", () => {
    // Host joins first and is told it is seat 1.
    let v = applyStateSync(INITIAL_VIEW, sync({ yourSeat: 1 }));
    expect(mySeat(v)).toBe(1);

    // A second player joins → the server broadcasts a sanitized sync with
    // yourSeat=null to the host. This must NOT wipe the host's seat.
    v = applyStateSync(v, sync({ yourSeat: null, currentTurnSeat: 2 }));
    expect(mySeat(v)).toBe(1);
  });

  it("adopts the seat from the first authoritative sync", () => {
    const v = applyStateSync(INITIAL_VIEW, sync({ yourSeat: 2 }));
    expect(mySeat(v)).toBe(2);
  });
});

describe("isMyTurn is correct for every seat, including seat 1 / host", () => {
  for (const seat of [1, 2]) {
    it(`seat ${seat} sees its turn when currentTurnSeat === ${seat}`, () => {
      const v = viewWith({ yourSeat: seat, currentTurnSeat: seat });
      expect(isMyTurn(v)).toBe(true);
    });

    it(`seat ${seat} does NOT see a turn that belongs to the other seat`, () => {
      const other = seat === 1 ? 2 : 1;
      const v = viewWith({ yourSeat: seat, currentTurnSeat: other });
      expect(isMyTurn(v)).toBe(false);
    });
  }

  it("the exact host bug: seat 1, then a null-seat broadcast, then its turn → still true", () => {
    let v = applyStateSync(INITIAL_VIEW, sync({ yourSeat: 1, currentTurnSeat: 2 }));
    v = applyStateSync(v, sync({ yourSeat: null, currentTurnSeat: 2 })); // 2nd player joins
    // turn comes to seat 1
    v = applyStateSync(v, sync({ yourSeat: null, currentTurnSeat: 1 }));
    expect(mySeat(v)).toBe(1);
    expect(isMyTurn(v)).toBe(true);
  });

  it("is false outside betting phases (e.g. SHOWDOWN)", () => {
    const v = viewWith({ yourSeat: 1, currentTurnSeat: 1, phase: "SHOWDOWN" });
    expect(isMyTurn(v)).toBe(false);
  });
});

describe("actionNotice (C10 — Arabic, every action incl. host/seat 1)", () => {
  const bet = (over: Partial<BetPlacedPayload>): BetPlacedPayload => ({
    seat: 1,
    action: "CHECK",
    amount: 0,
    pot: 100,
    pots: [{ amount: 100, eligibleSeats: [1, 2] }],
    currentBet: 0,
    ...over,
  });
  it("formats each action type for the named player", () => {
    expect(actionNotice("سامي", bet({ action: "CHECK" }))).toBe("سامي مرّر");
    expect(actionNotice("سامي", bet({ action: "CALL", amount: 50 }))).toBe("سامي ساوى 50");
    expect(actionNotice("سامي", bet({ action: "RAISE", currentBet: 150 }))).toContain("رفع إلى 150");
    expect(actionNotice("سامي", bet({ action: "ALLIN", amount: 300 }))).toContain("بكل رصيده");
    expect(actionNotice("سامي", bet({ action: "FOLD" }))).toBe("سامي انسحب");
  });
});

describe("isContender", () => {
  it("true for an ACTIVE/ALLIN local seat, false otherwise", () => {
    expect(isContender(viewWith({ yourSeat: 1 }))).toBe(true);
    expect(
      isContender(viewWith({ yourSeat: 1, players: [pv(1, "FOLDED", true), pv(2, "ACTIVE")] })),
    ).toBe(false);
    expect(
      isContender(viewWith({ yourSeat: 1, players: [pv(1, "ALLIN", true), pv(2, "ACTIVE")] })),
    ).toBe(true);
  });
});
