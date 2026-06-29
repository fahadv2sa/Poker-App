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
      photoUrl: null,
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
    const target = room.round!.state.hint!.targetRank; // server picks max hidden = 10
    matches.guess(room, 0, `p${target}`);
    const reveals = events[TT_SERVER_EVENTS.reveal] as { rank: number }[];
    expect(reveals.some((r) => r.rank === target)).toBe(true);
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

  it("awards round XP each round and a match-win bonus at the end (full lifecycle)", () => {
    const persist = {
      createMatch: vi.fn(async () => {}),
      saveRound: vi.fn(async () => {}),
      awardRoundXp: vi.fn(async () => {}),
      markWithdrawn: vi.fn(async () => {}),
      finishMatch: vi.fn(async () => {}),
    };
    const events: Events = {};
    const matches = new Matches({
      catalog: fakeCatalog(),
      persist,
      emit: (_id, e, p) => { (events[e] ??= []).push(p); },
      rng: () => 0.5,
    });
    const room = matches.createManual({ userId: "u0", username: "A", playerNumber: 1 }, "EASY", 600);
    matches.addSeat(room, { userId: "u1", username: "B", playerNumber: 2 }, false);
    matches.start(room, "u0");
    // play 3 full rounds (alternating guesses → the first guesser nets 30 > 25 = clear winner)
    for (let round = 1; round <= 3; round++) {
      for (let rank = 10; rank >= 1; rank--) {
        const seat = currentTurnSeat(room.round!.state)!;
        matches.guess(room, seat, `p${rank}`);
      }
      vi.advanceTimersByTime(5000);
    }
    expect(room.status).toBe("ENDED");
    // round XP + saveRound persisted once per round
    expect(persist.awardRoundXp).toHaveBeenCalledTimes(3);
    expect(persist.saveRound).toHaveBeenCalledTimes(3);
    // round XP map carried a positive award for the scoring seats
    const firstRoundXp = persist.awardRoundXp.mock.calls[0]![1] as Map<number, number>;
    expect([...firstRoundXp.values()].some((v) => v > 0)).toBe(true);
    // match-end persisted exactly once, with a clear winner + a positive win-bonus map
    expect(persist.finishMatch).toHaveBeenCalledTimes(1);
    const finishArgs = persist.finishMatch.mock.calls[0]!;
    expect(finishArgs[2]).toBeTruthy(); // winnerUserId
    expect([...(finishArgs[3] as Map<number, number>).values()].some((v) => v > 0)).toBe(true); // win bonus
    // and the match-ended broadcast carried standings
    const ended = events[TT_SERVER_EVENTS.matchEnded] as { standings: unknown[] }[];
    expect(ended).toHaveLength(1);
    expect(ended[0]!.standings.length).toBe(2);
  });

  it("the public hint view exposes its TARGET RANK (never the identity)", () => {
    const { matches, events } = makeMatches();
    const room = twoPlayerMatch(matches);
    for (let i = 0; i < 4; i++) vi.advanceTimersByTime(TT_TIMING.turnSec * 1000);
    expect(room.round!.state.mode).toBe("HINT");
    const target = room.round!.state.hint!.targetRank;
    const states = (events[TT_SERVER_EVENTS.state] ?? []) as { hint: { rank: number } | null }[];
    const withHint = states.filter((s) => s.hint);
    expect(withHint.length).toBeGreaterThan(0);
    expect(withHint.at(-1)!.hint!.rank).toBe(target); // rank shown, set from targetRank
  });

  it("closeRoom: only the CREATOR can close, and it ends the match for everyone", () => {
    const { matches, events } = makeMatches();
    const room = twoPlayerMatch(matches); // creator = u0
    matches.closeRoom(room, "u1"); // a non-creator → no-op
    expect(room.status).toBe("IN_PROGRESS");
    matches.closeRoom(room, "u0"); // creator → ends for all
    expect(room.status).toBe("ABANDONED");
    expect((events[TT_SERVER_EVENTS.matchEnded] as unknown[]).length).toBe(1);
    const toasts = (events[TT_SERVER_EVENTS.toast] ?? []) as { text: string }[];
    expect(toasts.some((t) => t.text.includes("أُغلقت"))).toBe(true);
  });

  it("closeRoom on a LOBBY room (creator) evicts everyone and drops the room", () => {
    const { matches } = makeMatches();
    const room = matches.createManual({ userId: "u0", username: "A", playerNumber: 1 }, "EASY", 600);
    matches.addSeat(room, { userId: "u1", username: "B", playerNumber: 2 }, false);
    expect(room.status).toBe("LOBBY");
    matches.closeRoom(room, "u0");
    expect(matches.get(room.id)).toBeUndefined();
  });

  it("tie: naming ANY one tied player reveals the rank once and cancels the rest", () => {
    const events: Record<string, unknown[]> = {};
    // rank 1 is a 2-way tie: p1a and p1b are both accepted answers for rank 1.
    const tiedEntry = {
      id: "tie1",
      type: "GOAL_SCORERS",
      leagueId: 39,
      competitionName: "PL",
      season: 2024,
      difficulty: "EASY",
      titleAr: "tie",
      players: [
        { rank: 1, playerId: "p1a", value: 10, name: "A1", nameAr: "أ", hints: [] },
        { rank: 1, playerId: "p1b", value: 10, name: "A2", nameAr: "ب", hints: [] },
        ...Array.from({ length: 9 }, (_, i) => ({
          rank: i + 2, playerId: `p${i + 2}`, value: 9 - i, name: `P${i + 2}`, nameAr: `ل${i + 2}`, hints: [],
        })),
      ],
    } as unknown as CatalogEntry;
    const matches = new Matches({
      catalog: { size: 1, pick: () => tiedEntry } as unknown as CatalogSource,
      persist: noopPersist,
      emit: (_id, e, p) => {
        (events[e] ??= []).push(p);
      },
      rng: () => 0.5,
    });
    const room = matches.createManual({ userId: "u0", username: "A", playerNumber: 1 }, "EASY", 600);
    matches.addSeat(room, { userId: "u1", username: "B", playerNumber: 2 }, false);
    matches.start(room, "u0");

    matches.guess(room, currentTurnSeat(room.round!.state)!, "p1a"); // name ONE tied player
    matches.guess(room, currentTurnSeat(room.round!.state)!, "p1b"); // name the OTHER → cancelled

    const reveals = (events[TT_SERVER_EVENTS.reveal] ?? []) as { rank: number; player: { id: string } }[];
    const rank1 = reveals.filter((r) => r.rank === 1);
    expect(rank1).toHaveLength(1); // rank 1 revealed exactly once
    expect(rank1[0]!.player.id).toBe("p1a"); // shows the player actually named
    expect(room.round!.state.hidden).not.toContain(1); // rank 1 cleared
    expect(room.round!.state.hidden).toHaveLength(9); // the other 9 ranks remain
    expect(room.status).toBe("IN_PROGRESS"); // not over — only 1 of 10 ranks revealed
  });
});
