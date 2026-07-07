import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GpFactPack } from "@fb/guess-player-engine";
import { GP_SERVER_EVENTS, GP_TIMING, type GpAskInput, type GpStateView } from "@fb/shared";
import { GpMatches } from "../src/match.js";
import type { GpFactsSource, ResolvedAsk } from "../src/facts.js";
import type { GpMatchRoom } from "../src/types.js";

/**
 * Match-orchestration tests with fake deps (no DB, no sockets), mirroring the
 * top-10-server harness. The fake facts source answers through the REAL
 * engine (answerQuestion) over a synthetic FactPack. Rounds are OPEN-ENDED:
 * every round ends at the winner screen, whose 15s countdown (or a unanimous
 * جولة جديدة) continues the SAME session with carried-over points.
 */

const HIDDEN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const CLUB_YES = "33333333-3333-4333-8333-333333333333";
const CLUB_NO = "44444444-4444-4444-8444-444444444444";
// The no-repeat rule (usedPlayerIds) means every round needs a fresh hidden
// player — a pool of distinct ids the fake pickHidden draws from in order.
const HIDDEN_POOL = [
  HIDDEN_ID,
  ...Array.from({ length: 9 }, (_, i) => `55555555-5555-4555-8555-55555555555${i}`),
];

function packFor(playerId: string): GpFactPack {
  return {
    playerId,
    name: "Hidden Player",
    nameAr: "اللاعب الخفي",
    nationalityName: "Egypt",
    clubIdsEver: [CLUB_YES],
    clubSeasons: [{ clubId: CLUB_YES, season: 2020 }],
    seasonsWithClubData: [2020],
    nationalTeamCountries: ["Egypt"],
    nationalTeamsComplete: true,
    competitionIdsEver: [39],
    competitionSeasons: [{ leagueId: 39, season: 2020 }],
    seasonsWithCompleteCompetitionData: [2020],
    seasonLines: [{ leagueId: 39, clubId: CLUB_YES, season: 2020 }],
    trophies: [],
    trophiesImported: true,
  };
}

const hiddenFor = (playerId: string) => ({
  ref: { id: playerId, name: "Hidden Player", nameAr: "اللاعب الخفي", photoUrl: null },
  pack: packFor(playerId),
});

function fakeFacts(): GpFactsSource {
  return {
    pickHidden: async (_difficulty, usedIds) => {
      const next = HIDDEN_POOL.find((id) => !usedIds.has(id));
      return next ? hiddenFor(next) : null;
    },
    loadHidden: async (playerId: string) => hiddenFor(playerId),
    resolveAsk: async (input: GpAskInput): Promise<ResolvedAsk | null> => {
      if (input.template === "CLUB_EVER") {
        return {
          q: { template: "CLUB_EVER", clubId: input.clubId },
          params: { clubName: input.clubId === CLUB_YES ? "Yes FC" : "No FC" },
        };
      }
      if (input.template === "CLUB_SEASON") {
        return {
          q: { template: "CLUB_SEASON", clubId: input.clubId, season: input.season },
          params: { clubName: "Yes FC", season: input.season },
        };
      }
      return null; // everything else unresolvable in this fake
    },
    resolvePlayer: async (playerId: string) => ({
      id: playerId,
      name: "Named",
      nameAr: null,
      photoUrl: null,
    }),
  };
}

const noopPersist = {
  createMatch: vi.fn(async () => {}),
  createRound: vi.fn(async () => "round-db-id"),
  saveQuestion: vi.fn(async () => {}),
  saveGuess: vi.fn(async () => {}),
  finishRound: vi.fn(async () => {}),
  awardXp: vi.fn(
    async (_userId: string, _matchId: string, _amount: number, _reference: string, _reason: string) => {},
  ),
  markWithdrawn: vi.fn(async () => {}),
  finishMatch: vi.fn(async () => {}),
};

type Events = Record<string, unknown[]>;
function makeMatches() {
  const events: Events = {};
  const matches = new GpMatches({
    facts: fakeFacts(),
    persist: noopPersist,
    emit: (_target, event, payload) => {
      (events[event] ??= []).push(payload);
    },
  });
  return { matches, events };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

const lastState = (events: Events): GpStateView =>
  events[GP_SERVER_EVENTS.state]!.at(-1) as GpStateView;

async function vsSystemMatch(matches: GpMatches, players = 2): Promise<GpMatchRoom> {
  const room = matches.createManual(
    { userId: "u0", username: "A", playerNumber: 1 },
    { mode: "VS_SYSTEM", difficulty: "EASY" },
  );
  for (let i = 1; i < players; i++) {
    matches.addSeat(room, { userId: `u${i}`, username: String.fromCharCode(65 + i), playerNumber: i + 1 });
  }
  matches.start(room, "u0");
  await settle();
  return room;
}

async function vsHumansMatch(matches: GpMatches): Promise<GpMatchRoom> {
  const room = matches.createManual(
    { userId: "u0", username: "A", playerNumber: 1 },
    { mode: "VS_HUMANS" },
  );
  matches.addSeat(room, { userId: "u1", username: "B", playerNumber: 2 });
  matches.addSeat(room, { userId: "u2", username: "C", playerNumber: 3 });
  matches.start(room, "u0");
  await settle();
  return room;
}

const userAt = (room: GpMatchRoom, seat: number | null) =>
  room.seats.find((s) => s.seat === seat)!.userId;

/** Round → winner screen: run out the post-reveal pause into the countdown. */
async function toWinnerScreen() {
  await vi.advanceTimersByTimeAsync(GP_TIMING.nextRoundPauseMs);
  await settle();
}

describe("Guess the Player match orchestration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("VS_SYSTEM: starts PLAYING with a hidden player and a rotation", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    expect(room.status).toBe("IN_PROGRESS");
    expect(room.round?.phase).toBe("PLAYING");
    expect(room.round?.hidden?.pack.playerId).toBe(HIDDEN_ID);
    const st = lastState(events);
    expect(st.turnSeat).not.toBeNull();
    // secrecy: the snapshot must never carry the hidden player
    expect(JSON.stringify(st)).not.toContain(HIDDEN_ID);
  });

  it("YES/NO answers consume the turn; UNKNOWN keeps it", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const seat0 = room.round!.turnOrder[0]!;
    // YES (club in career) → turn advances
    await matches.ask(room, userAt(room, seat0), { template: "CLUB_EVER", clubId: CLUB_YES });
    let q = events[GP_SERVER_EVENTS.question]!.at(-1) as { answer: string };
    expect(q.answer).toBe("YES");
    expect(lastState(events).turnSeat).not.toBe(seat0);
    // UNKNOWN (season outside coverage) → same seat keeps the turn
    const seat1 = lastState(events).turnSeat!;
    await matches.ask(room, userAt(room, seat1), {
      template: "CLUB_SEASON",
      clubId: CLUB_YES,
      season: 1999,
    });
    q = events[GP_SERVER_EVENTS.question]!.at(-1) as { answer: string };
    expect(q.answer).toBe("UNKNOWN");
    expect(lastState(events).turnSeat).toBe(seat1);
  });

  it("an unresolvable question consumes nothing", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const seat0 = room.round!.turnOrder[0]!;
    await matches.ask(room, userAt(room, seat0), {
      template: "NATIONALITY",
      countryName: "Egypt",
    }); // fake resolves null for this template
    expect(events[GP_SERVER_EVENTS.question]).toBeUndefined();
    expect(lastState(events).turnSeat).toBe(seat0);
  });

  it("the third wrong guess makes a SPECTATOR: skipped by the rotation, no asking/guessing", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const r = room.round!;
    const seat0 = r.turnOrder[0]!;
    const seat1 = r.turnOrder[1]!;
    const uid = userAt(room, seat0);
    for (let i = 0; i < 3; i++) {
      // rotate back to seat0 by letting the other seat time out when needed
      while (lastState(events).turnSeat !== seat0) {
        await vi.advanceTimersByTimeAsync(GP_TIMING.turnSec * 1000);
      }
      await matches.guess(room, uid, OTHER_ID);
      await settle();
    }
    expect(r.guessesLeft.get(seat0)).toBe(0);
    expect(events[GP_SERVER_EVENTS.wrongGuess]!.length).toBe(3);

    // Exhausted → OUT of the rotation for the rest of the round (spectator):
    // the round continues with the other contestant, never returning to seat0.
    expect(room.round).toBe(r); // round did NOT end — a contestant remains
    expect(r.turnOrder).toEqual([seat1]);
    expect(lastState(events).turnSeat).toBe(seat1);
    const seatView = lastState(events).seats.find((s) => s.seat === seat0)!;
    expect(seatView.exhausted).toBe(true);

    // Both asking and guessing rights are gone (owner ruling): a stray ask or
    // guess from the spectator is ignored — it is never their turn again.
    const questionsBefore = (events[GP_SERVER_EVENTS.question] ?? []).length;
    await matches.ask(room, uid, { template: "CLUB_EVER", clubId: CLUB_NO });
    await matches.guess(room, uid, HIDDEN_ID);
    await settle();
    expect((events[GP_SERVER_EVENTS.question] ?? []).length).toBe(questionsBefore);
    expect(room.round?.hidden?.pack.playerId).toBe(HIDDEN_ID); // still the same live round
  });

  it("ALL contestants exhausted → the round ends IMMEDIATELY with the timeout treatment", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const r = room.round!;
    // Burn all 3 attempts of BOTH contestants (whoever holds the turn guesses).
    for (let i = 0; i < 6; i++) {
      if (!room.round || room.round !== r) break;
      const turn = lastState(events).turnSeat;
      if (turn == null) break;
      await matches.guess(room, userAt(room, turn), OTHER_ID);
      await settle();
    }
    // The last exhaustion ended the round on the spot: reveal, NO winner.
    const reveal = events[GP_SERVER_EVENTS.reveal]!.at(-1) as {
      reason: string;
      winnerSeat: number | null;
      player: { id: string };
    };
    expect(reveal.reason).toBe("TIMER"); // timeout treatment (survival rules apply)
    expect(reveal.winnerSeat).toBeNull();
    expect(reveal.player.id).toBe(HIDDEN_ID); // the hidden player's card is revealed
  });

  it("«كشف اللاعب»: unanimous approval reveals with the timeout treatment; a decline cancels", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const r = room.round!;
    const seat0 = r.turnOrder[0]!;
    const seat1 = r.turnOrder[1]!;

    // A decline cancels the request and play continues.
    matches.requestReveal(room, userAt(room, seat0));
    expect(r.revealReq?.bySeat).toBe(seat0);
    matches.voteReveal(room, userAt(room, seat1), false);
    expect(r.revealReq).toBeNull();
    expect(room.round).toBe(r); // round unchanged

    // The request expires with the current turn (turn timeout moves it on).
    matches.requestReveal(room, userAt(room, seat0));
    await vi.advanceTimersByTimeAsync(GP_TIMING.turnSec * 1000);
    expect(r.revealReq).toBeNull();

    // Unanimous approval → reveal, no winner, timeout treatment.
    matches.requestReveal(room, userAt(room, seat0));
    matches.voteReveal(room, userAt(room, seat1), true);
    await settle();
    const reveal = events[GP_SERVER_EVENTS.reveal]!.at(-1) as {
      reason: string;
      winnerSeat: number | null;
    };
    expect(reveal.reason).toBe("TIMER");
    expect(reveal.winnerSeat).toBeNull();
  });

  it("a correct guess ends the round with time-scaled points (EASY ×1)", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const seat0 = room.round!.turnOrder[0]!;
    await vi.advanceTimersByTimeAsync(0);
    await matches.guess(room, userAt(room, seat0), HIDDEN_ID);
    await settle();
    const reveal = events[GP_SERVER_EVENTS.reveal]!.at(-1) as {
      reason: string;
      winnerSeat: number;
      winnerPoints: number;
      player: { id: string };
    };
    expect(reveal.reason).toBe("CORRECT_GUESS");
    expect(reveal.winnerSeat).toBe(seat0);
    expect(reveal.player.id).toBe(HIDDEN_ID);
    expect(reveal.winnerPoints).toBe(500); // instant solve, full clock
    expect(room.seats.find((s) => s.seat === seat0)!.totalPoints).toBe(500);
  });

  it("timer expiry → winner screen; the countdown expiry auto-starts the next round (no fixed length)", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    // A real table has activity — one ask keeps the 30-min idle clock away.
    const seat = room.round!.turnOrder[0]!;
    await matches.ask(room, userAt(room, seat), { template: "CLUB_EVER", clubId: CLUB_YES });
    await vi.advanceTimersByTimeAsync(GP_TIMING.roundSec * 1000);
    const reveal = events[GP_SERVER_EVENTS.reveal]!.at(-1) as {
      roundNo: number;
      reason: string;
      winnerSeat: number | null;
    };
    expect(reveal).toMatchObject({ roundNo: 1, reason: "TIMER", winnerSeat: null });
    await toWinnerScreen();
    // At the winner screen: the SESSION is not over — no matchEnded, and the
    // state carries the 15s continuation countdown.
    expect(room.status).toBe("ENDED");
    expect(events[GP_SERVER_EVENTS.matchEnded]).toBeUndefined();
    expect(lastState(events).newMatchRequest).not.toBeNull();
    // Countdown expiry auto-starts round 2 with a FRESH hidden player.
    await vi.advanceTimersByTimeAsync(GP_TIMING.newMatchGraceSec * 1000);
    await settle();
    expect(room.status).toBe("IN_PROGRESS");
    expect(room.round?.roundNo).toBe(2);
    expect(room.round?.hidden?.ref.id).not.toBe(HIDDEN_ID); // no repeats per table
  });

  it("all players pressing جولة جديدة starts the next round instantly; points carry over", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const seat0 = room.round!.turnOrder[0]!;
    await matches.guess(room, userAt(room, seat0), HIDDEN_ID);
    await settle();
    await toWinnerScreen();
    expect(room.status).toBe("ENDED");
    matches.requestNewMatch(room, "u0");
    await settle();
    expect(room.status).toBe("ENDED"); // 1 of 2 ready — countdown keeps running
    matches.requestNewMatch(room, "u1");
    await settle();
    expect(room.status).toBe("IN_PROGRESS");
    expect(room.round?.roundNo).toBe(2);
    // cumulative scoring: round-1 points survive into round 2
    expect(room.seats.find((s) => s.seat === seat0)!.totalPoints).toBe(500);
    expect(events[GP_SERVER_EVENTS.matchEnded]).toBeUndefined();
  });

  it("the last player leaving the winner screen closes the session and awards SESSION_WIN to the unique leader", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    const seat0 = room.round!.turnOrder[0]!;
    const winnerUid = userAt(room, seat0);
    const loserUid = winnerUid === "u0" ? "u1" : "u0";
    await matches.guess(room, winnerUid, HIDDEN_ID);
    await settle();
    await toWinnerScreen();
    matches.withdraw(room, loserUid);
    await settle();
    expect(room.status).toBe("ENDED"); // one player still at the winner screen
    matches.withdraw(room, winnerUid);
    await settle();
    expect(matches.get(room.id)).toBeUndefined(); // session closed + room dropped
    expect(events[GP_SERVER_EVENTS.matchEnded]!.length).toBe(1);
    expect(noopPersist.finishMatch).toHaveBeenCalledTimes(1);
    const sessionWin = noopPersist.awardXp.mock.calls.find((c) => c[4] === "SESSION_WIN");
    expect(sessionWin?.[0]).toBe(winnerUid);
  });

  it("a table with no human action for 30 minutes closes (idle rule)", async () => {
    const { matches, events } = makeMatches();
    const room = await vsSystemMatch(matches);
    // Nobody acts: turns auto-advance and rounds auto-expire, but none of
    // that is HUMAN activity — the idle clock (armed at start) fires first.
    await vi.advanceTimersByTimeAsync(GP_TIMING.idleCloseMs);
    await settle();
    expect(room.status).toBe("ABANDONED");
    expect(matches.get(room.id)).toBeUndefined(); // removed immediately
    expect(events[GP_SERVER_EVENTS.tableClosed]!.length).toBeGreaterThanOrEqual(1);
  });

  it("VS_HUMANS: creator picks; picker is excluded from turns; solved round pays the 25% share", async () => {
    const { matches, events } = makeMatches();
    const room = await vsHumansMatch(matches);
    const r = room.round!;
    expect(r.phase).toBe("PICKING");
    expect(r.pickerSeat).toBe(0); // creator picks round 1
    await matches.pick(room, "u0", HIDDEN_ID);
    await settle();
    expect(room.round!.phase).toBe("PLAYING");
    expect(room.round!.turnOrder).not.toContain(0);
    // picker cannot ask or guess
    await matches.ask(room, "u0", { template: "CLUB_EVER", clubId: CLUB_YES });
    expect(events[GP_SERVER_EVENTS.question]).toBeUndefined();
    // a contestant solves it instantly
    const winnerSeat = room.round!.turnOrder[0]!;
    await matches.guess(room, userAt(room, winnerSeat), HIDDEN_ID);
    await settle();
    const reveal = events[GP_SERVER_EVENTS.reveal]!.at(-1) as {
      winnerPoints: number;
      pickerSeat: number;
      pickerPoints: number;
    };
    expect(reveal.winnerPoints).toBe(500); // no difficulty multiplier in VS_HUMANS
    expect(reveal.pickerSeat).toBe(0);
    expect(reveal.pickerPoints).toBe(125); // 25% share
    // the correct guesser is the picker of the NEXT round — the role is
    // carried across the winner-screen countdown
    await toWinnerScreen();
    expect(room.status).toBe("ENDED");
    await vi.advanceTimersByTimeAsync(GP_TIMING.newMatchGraceSec * 1000);
    await settle();
    expect(room.round?.phase).toBe("PICKING");
    expect(room.round?.pickerSeat).toBe(winnerSeat);
  });

  it("VS_HUMANS: timeout pays the survival bonus and the SAME picker picks again", async () => {
    const { matches, events } = makeMatches();
    const room = await vsHumansMatch(matches);
    await matches.pick(room, "u0", HIDDEN_ID);
    await settle();
    await vi.advanceTimersByTimeAsync(GP_TIMING.roundSec * 1000);
    const reveal = events[GP_SERVER_EVENTS.reveal]!.at(-1) as {
      reason: string;
      winnerSeat: number | null;
      pickerPoints: number;
    };
    expect(reveal).toMatchObject({ reason: "TIMER", winnerSeat: null, pickerPoints: 150 });
    expect(room.seats.find((s) => s.seat === 0)!.totalPoints).toBe(150);
    await toWinnerScreen();
    await vi.advanceTimersByTimeAsync(GP_TIMING.newMatchGraceSec * 1000);
    await settle();
    expect(room.round?.pickerSeat).toBe(0); // same picker
  });

  it("VS_HUMANS: pick timeout auto-picks so the table never hangs", async () => {
    const { matches } = makeMatches();
    const room = await vsHumansMatch(matches);
    expect(room.round!.phase).toBe("PICKING");
    await vi.advanceTimersByTimeAsync(GP_TIMING.pickSec * 1000);
    await settle();
    expect(room.round!.phase).toBe("PLAYING");
    expect(room.round!.hidden).not.toBeNull();
  });

  it("solo quick play starts with one player (approved decision)", async () => {
    const { matches } = makeMatches();
    const room = matches.createQuickPlay("MEDIUM");
    matches.addSeat(room, { userId: "solo", username: "S", playerNumber: 9 });
    const res = matches.start(room, "solo", true);
    expect(res.ok).toBe(true);
    await settle();
    expect(room.round?.phase).toBe("PLAYING");
  });

  it("withdrawal removes the seat from rotation; an emptied table abandons", async () => {
    const { matches } = makeMatches();
    const room = await vsSystemMatch(matches);
    matches.withdraw(room, "u0");
    await settle();
    expect(room.round?.turnOrder).toEqual(
      room.seats.filter((s) => s.status === "ACTIVE").map((s) => s.seat),
    );
    matches.withdraw(room, "u1");
    await settle();
    expect(room.status).toBe("ABANDONED");
    expect(matches.get(room.id)).toBeUndefined(); // last human gone → closed NOW
  });

  it("turn timeout advances the rotation", async () => {
    const { matches, events } = makeMatches();
    await vsSystemMatch(matches);
    const first = lastState(events).turnSeat;
    await vi.advanceTimersByTimeAsync(GP_TIMING.turnSec * 1000);
    expect(lastState(events).turnSeat).not.toBe(first);
  });
});
