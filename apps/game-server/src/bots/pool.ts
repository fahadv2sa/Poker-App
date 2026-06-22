import type { BotIdentity } from "./identities.js";

/**
 * In-memory pool of bot identities (single-instance game-server). Hands out free
 * identities to fill seats and tracks which are in use across all live tables, so
 * the same bot never appears at two tables at once. Pure data structure — no I/O.
 */
export class BotIdentityPool {
  private readonly all: BotIdentity[];
  private readonly inUse = new Set<number>(); // by playerNumber

  constructor(identities: readonly BotIdentity[]) {
    this.all = [...identities];
  }

  get total(): number {
    return this.all.length;
  }

  get available(): number {
    return this.all.length - this.inUse.size;
  }

  /**
   * Acquire up to `count` free identities (fewer if the pool is short), marking
   * them in use. Shuffled with the injected `rng` so the same identities don't
   * always fill the early seats.
   */
  acquire(count: number, rng: () => number = Math.random): BotIdentity[] {
    if (count <= 0) return [];
    const free = this.all.filter((i) => !this.inUse.has(i.playerNumber));
    shuffle(free, rng);
    const take = free.slice(0, count);
    for (const i of take) this.inUse.add(i.playerNumber);
    return take;
  }

  /** Return identities to the pool (idempotent — releasing an unknown id no-ops). */
  release(identities: Iterable<{ playerNumber: number }>): void {
    for (const i of identities) this.inUse.delete(i.playerNumber);
  }

  /** Return a single identity to the pool (when a human replaces that bot). */
  releaseOne(playerNumber: number): void {
    this.inUse.delete(playerNumber);
  }
}

/** Fisher–Yates in place. */
function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
