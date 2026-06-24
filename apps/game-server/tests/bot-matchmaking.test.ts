import { QUICK_PLAY, SERVER_EVENTS } from "@fb/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matchmaking, type MatchmakingDeps } from "../src/matchmaking.js";

/**
 * Phase 4 — the matchmaking cold-start bot-fill window. Uses a minimal fake
 * Socket.IO server and fake timers so the windows/grace are driven explicitly.
 * With `botFillWindowSec` unset the behavior is exactly as before bots.
 */

function fakeIo() {
  const socket = { join: vi.fn(), leave: vi.fn(), emit: vi.fn() };
  const io = {
    sockets: { sockets: { get: () => socket } },
    to: () => ({ emit: vi.fn() }),
  } as unknown as MatchmakingDeps["io"];
  return { io, socket };
}

function setup(botFillWindowSec?: number) {
  const { io } = fakeIo();
  const createQuickGame = vi.fn(async () => ({ gameId: "g1", inviteCode: "INV" }));
  const startTable = vi.fn(async () => {});
  const mm = new Matchmaking({ io, createQuickGame, startTable, botFillWindowSec });
  return { mm, createQuickGame, startTable };
}

let n = 0;
const join = (mm: Matchmaking, tier: "EASY" | "MEDIUM" | "ELITE" = "EASY") => {
  n += 1;
  mm.join(`s${n}`, { userId: `u${n}`, username: `u${n}`, playerNumber: n }, tier);
};

beforeEach(() => {
  vi.useFakeTimers();
  n = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("matchmaking — cold-start bot-fill window (bots ENABLED)", () => {
  it("arms a short window for a lone human, then matches + schedules the table", async () => {
    const { mm, createQuickGame, startTable } = setup(QUICK_PLAY.botFillWindowSec);
    join(mm); // 1 human, below minPlayers

    // Nothing happens immediately — it waits the short window.
    await vi.advanceTimersByTimeAsync(QUICK_PLAY.botFillWindowSec * 1000 - 100);
    expect(createQuickGame).not.toHaveBeenCalled();

    // Window elapses → a match is created with the lone human as host.
    await vi.advanceTimersByTimeAsync(200);
    expect(createQuickGame).toHaveBeenCalledTimes(1);
    expect(createQuickGame).toHaveBeenCalledWith("EASY", "u1");

    // After the start grace, the table is asked to start (where bots fill in).
    await vi.advanceTimersByTimeAsync(QUICK_PLAY.startGraceSec * 1000);
    expect(startTable).toHaveBeenCalledWith("g1");
  });

  it("still starts instantly at a full table without waiting", async () => {
    const { mm, createQuickGame } = setup(QUICK_PLAY.botFillWindowSec);
    for (let i = 0; i < QUICK_PLAY.maxSeats; i++) join(mm);
    await vi.advanceTimersByTimeAsync(1);
    expect(createQuickGame).toHaveBeenCalledTimes(1);
  });
});

describe("matchmaking — waiting lobby fills (cosmetic ramp)", () => {
  function capturingSetup(botFillWindowSec?: number) {
    const states: { count: number }[] = [];
    const socket = { join: vi.fn(), leave: vi.fn(), emit: vi.fn() };
    const io = {
      sockets: { sockets: { get: () => socket } },
      to: () => ({
        emit: (ev: string, p: { count: number }) => {
          if (ev === SERVER_EVENTS.queueState) states.push(p);
        },
      }),
    } as unknown as MatchmakingDeps["io"];
    const mm = new Matchmaking({
      io,
      createQuickGame: vi.fn(async () => ({ gameId: "g1", inviteCode: "INV" })),
      startTable: vi.fn(async () => {}),
      botFillWindowSec,
    });
    return { mm, states };
  }

  it("ramps the lobby count above the lone human during the bot-fill window", async () => {
    const { mm, states } = capturingSetup(QUICK_PLAY.botFillWindowSec);
    join(mm); // 1 real human, cold start
    // Advance through most of the window (not past it, so the match doesn't fire).
    await vi.advanceTimersByTimeAsync(QUICK_PLAY.botFillWindowSec * 1000 - 300);
    const maxCount = Math.max(...states.map((s) => s.count));
    expect(maxCount).toBeGreaterThan(1); // seats visibly filled past "just me"
    expect(maxCount).toBeLessThanOrEqual(QUICK_PLAY.maxSeats);
  });

  it("does NOT ramp when bots are disabled — count stays at the real humans", async () => {
    const { mm, states } = capturingSetup(undefined);
    join(mm);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(states.every((s) => s.count === 1)).toBe(true);
  });
});

describe("matchmaking — bots DISABLED (today's behavior)", () => {
  it("a lone human never triggers a match, however long they wait", async () => {
    const { mm, createQuickGame } = setup(undefined);
    join(mm);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(createQuickGame).not.toHaveBeenCalled();
  });

  it("the all-human path is unchanged: minPlayers arms the standard window", async () => {
    const { mm, createQuickGame } = setup(undefined);
    for (let i = 0; i < QUICK_PLAY.minPlayers; i++) join(mm);

    await vi.advanceTimersByTimeAsync(QUICK_PLAY.fillWindowSec * 1000 - 100);
    expect(createQuickGame).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(createQuickGame).toHaveBeenCalledTimes(1);
  });
});
