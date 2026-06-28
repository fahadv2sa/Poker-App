import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { currentTurnSeat } from "@fb/top-10-engine";
import { TT_SERVER_EVENTS, TT_TIMING } from "@fb/shared";
import { Matches } from "../src/match.js";
import type { CatalogEntry, CatalogSource } from "../src/catalog.js";
import type { MatchRoom } from "../src/types.js";

function fakeEntry(id: string): CatalogEntry {
  return {
    id,
    type: "GOAL_SCORERS",
    leagueId: 39,
    competitionName: "PL",
    season: 2024,
    difficulty: "EASY",
    titleAr: "test",
    players: Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      playerId: `p${i + 1}`,
      value: 10 - i,
      name: `P${i + 1}`,
      nameAr: `لاعب${i + 1}`,
      hints: ["الجنسية: مصر", "أحد أنديته: ليفربول", "المركز: مهاجم"],
    })),
  };
}

let seq = 0;
const fakeCatalog = (): CatalogSource =>
  ({
    size: 99,
    pick: () => fakeEntry(`e${seq++}`),
  }) as unknown as CatalogSource;

const noopPersist = {
  createMatch: vi.fn(async () => {}),
  saveRound: vi.fn(async () => {}),
  awardRoundXp: vi.fn(async () => {}),
  markWithdrawn: vi.fn(async () => {}),
  finishMatch: vi.fn(async () => {}),
};

type Events = Record<string, unknown[]>;
function makeMatches() {
  const events: Events = {};
  const matches = new Matches({
    catalog: fakeCatalog(),
    persist: noopPersist,
    emit: (_id, event, payload) => {
      (events[event] ??= []).push(payload);
    },
    rng: () => 0.5,
  });
  return { matches, events };
}

function twoPlayerMatch(matches: Matches): MatchRoom {
  const room = matches.createManual({ userId: "u0", username: "A", playerNumber: 1 }, "EASY", 600);
  matches.addSeat(room, { userId: "u1", username: "B", playerNumber: 2 }, false);
  matches.start(room, "u0");
  return room;
}

describe("Top Ten match orchestration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seq = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("reveals, scores, and advances turns on a correct guess", () => {
    const { matches, events } = makeMatches();
    const room = twoPlayerMatch(matches);
    expect(room.status).toBe("IN_PROGRESS");
    const seat = currentTurnSeat(room.round!.state)!;
    matches.guess(room, seat, "p10"); // worth 10 points
    const reveals = events[TT_SERVER_EVENTS.reveal] as { rank: number; points: number; bySeat: number }[];
    expect(reveals.at(-1)).toMatchObject({ rank: 10, points: 10, bySeat: seat });
    expect(room.seats.find((s) => s.seat === seat)!).toBeDefined();
    expect(currentTurnSeat(room.round!.state)).not.toBe(seat); // advanced
  });

  it("completes a full 3-round match and ends with standings", () => {
    const { matches, events } = makeMatches();
    const room = twoPlayerMatch(matches);
    for (let round = 1; round <= 3; round++) {
      // reveal all 10 cards this round
      for (let rank = 10; rank >= 1; rank--) {
        const seat = currentTurnSeat(room.round!.state)!;
        matches.guess(room, seat, `p${rank}`);
      }
      // round ended; advance the 5s gap to start the next round (rounds 1,2)
      vi.advanceTimersByTime(5000);
    }
    expect(room.status).toBe("ENDED");
    const ended = events[TT_SERVER_EVENTS.matchEnded] as { standings: { place: number }[] }[];
    expect(ended.length).toBe(1);
    expect(ended[0]!.standings[0]!.place).toBe(1);
  });

  it("switches to HINT after two scoreless rotations, then a target guess scores", () => {
    const { matches, events } = makeMatches();
    const room = twoPlayerMatch(matches);
    // two full rotations of turn-timeouts (2 players × 2 = 4 × 30s)
    for (let i = 0; i < 4; i++) vi.advanceTimersByTime(TT_TIMING.turnSec * 1000);
    expect(room.round!.state.mode).toBe("HINT");
    // hint countdown (10s) → open window
    vi.advanceTimersByTime(TT_TIMING.hintCountdownSec * 1000);
    expect(room.round!.state.hint?.phase).toBe("OPEN");
    const targetId = room.round!.state.hint!.targetPlayerId; // server picks the top hidden card
    matches.guess(room, 0, targetId);
    const reveals = events[TT_SERVER_EVENTS.reveal] as { player: { id: string } }[];
    expect(reveals.some((r) => r.player.id === targetId)).toBe(true);
  });

  it("withdrawal below the minimum ends the match (ABANDONED) and zeroes points", () => {
    const { matches } = makeMatches();
    const room = twoPlayerMatch(matches);
    const seat = currentTurnSeat(room.round!.state)!;
    matches.guess(room, seat, "p10"); // score something first
    matches.withdraw(room, "u1"); // now only 1 active player
    expect(room.status).toBe("ABANDONED");
    expect(room.seats.every((s) => s.totalPoints === 0)).toBe(true);
  });

  it("tears down the match when the last human leaves even if bots remain active", () => {
    const { matches } = makeMatches();
    // 1 human + 2 bots = 3 active seats (>= minimum), so the table stays above the
    // seat floor; only the no-human check should close it.
    const room = matches.createManual({ userId: "u0", username: "A", playerNumber: 1 }, "EASY", 600);
    matches.addSeat(room, { userId: "b1", username: "Bot1", playerNumber: 900001 }, true);
    matches.addSeat(room, { userId: "b2", username: "Bot2", playerNumber: 900002 }, true);
    matches.start(room, "u0");
    expect(room.status).toBe("IN_PROGRESS");

    matches.withdraw(room, "u0"); // last human leaves; 2 bots are still ACTIVE
    expect(room.status).toBe("ABANDONED");
  });

  it("removes an emptied LOBBY room so it never lingers in the room list", () => {
    const { matches } = makeMatches();
    // A manual room seats its creator; never started (stays in LOBBY).
    const room = matches.createManual({ userId: "u0", username: "A", playerNumber: 1 }, "EASY", 600);
    expect(room.status).toBe("LOBBY");
    expect(matches.get(room.id)).toBe(room);

    matches.withdraw(room, "u0"); // last (only) seat leaves the lobby
    expect(matches.get(room.id)).toBeUndefined();
    expect(matches.list().some((r) => r.id === room.id)).toBe(false);
  });
});
