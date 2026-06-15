/**
 * Tiny in-memory fixed-window rate limiter (Section 6 / 16). Pure: it operates
 * on a caller-owned store and an injectable clock, so it is deterministic and
 * unit-testable. Each process (web, game-server) holds its own store — adequate
 * for the v1 single-server deployment; swap for Redis when scaling out.
 */

export interface RateBucket {
  count: number;
  resetAt: number;
}

export type RateStore = Map<string, RateBucket>;

export interface RateResult {
  allowed: boolean;
  /** Milliseconds until the window resets (0 when allowed). */
  retryAfterMs: number;
}

export function rateLimit(
  store: RateStore,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateResult {
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Drop expired buckets so the store can't grow without bound. */
export function sweepRateStore(store: RateStore, now: number = Date.now()): void {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}
