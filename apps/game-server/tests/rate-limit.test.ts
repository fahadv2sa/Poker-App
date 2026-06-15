import { describe, expect, it } from "vitest";
import { rateLimit, sweepRateStore, type RateStore } from "@fp/shared";

/**
 * Rate limiter (audit #9 / Section 16) used to throttle auth, bank, and WS
 * connections. Pure + clock-injectable, so it's deterministic.
 */
describe("rateLimit", () => {
  it("allows up to the limit within a window, then blocks", () => {
    const store: RateStore = new Map();
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(store, "k", 3, 1000, 100 + i).allowed).toBe(true);
    }
    const blocked = rateLimit(store, "k", 3, 1000, 110);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets once the window elapses", () => {
    const store: RateStore = new Map();
    expect(rateLimit(store, "k", 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit(store, "k", 1, 1000, 500).allowed).toBe(false); // still inside window
    expect(rateLimit(store, "k", 1, 1000, 1001).allowed).toBe(true); // window rolled over
  });

  it("isolates keys", () => {
    const store: RateStore = new Map();
    expect(rateLimit(store, "a", 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit(store, "a", 1, 1000, 1).allowed).toBe(false);
    expect(rateLimit(store, "b", 1, 1000, 1).allowed).toBe(true);
  });

  it("sweeps expired buckets so the store can't grow unbounded", () => {
    const store: RateStore = new Map();
    rateLimit(store, "k", 1, 1000, 0);
    expect(store.size).toBe(1);
    sweepRateStore(store, 2000);
    expect(store.size).toBe(0);
  });
});
