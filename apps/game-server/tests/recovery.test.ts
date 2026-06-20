import { describe, expect, it } from "vitest";
import { computeOrphanRefunds, type LedgerRow } from "../src/recovery.js";

/**
 * Pure reconciliation logic for the server-restart orphan case. Rows arrive in
 * chronological order (created_at asc); the unresolved hand is everything AFTER
 * the last `:resolve:` row. References mirror the real server:
 *   ante       g:h{N}:ante:{seat}
 *   bet/raise  g:act:{seat}:{seq}      (no hand number — positional split needed)
 *   foldrefund g:h{N}:foldrefund:{seat}
 *   resolve    g:h{N}:resolve:{seat}:{TYPE}:{seq}
 */

const G = "11111111-1111-1111-1111-111111111111";
const row = (userId: string, amount: bigint, reference: string): LedgerRow => ({
  userId,
  amount,
  reference,
});
const sorted = (rs: { userId: string; amount: bigint }[]) =>
  [...rs].sort((a, b) => a.userId.localeCompare(b.userId));

describe("computeOrphanRefunds — refund only the unresolved hand", () => {
  it("refunds the orphaned hand's antes; the completed hand is preserved", () => {
    // h1 completed (u1 won 100), h2 orphaned mid-preflop (both anted, no resolve).
    const rows = [
      row("u1", -50n, `${G}:h1:ante:1`),
      row("u2", -50n, `${G}:h1:ante:2`),
      row("u1", 100n, `${G}:h1:resolve:1:WIN:0`),
      row("u1", -50n, `${G}:h2:ante:1`),
      row("u2", -50n, `${G}:h2:ante:2`),
    ];
    expect(sorted(computeOrphanRefunds(rows))).toEqual([
      { userId: "u1", amount: 50n },
      { userId: "u2", amount: 50n },
    ]);
  });

  it("does NOT refund bets from a resolved hand (the positional-split case)", () => {
    // h1: antes + a raise + a call, then resolve. h2: antes only, orphaned.
    const rows = [
      row("u1", -50n, `${G}:h1:ante:1`),
      row("u2", -50n, `${G}:h1:ante:2`),
      row("u1", -100n, `${G}:act:1:1`), // u1 raises in h1 (no hand tag in ref)
      row("u2", -100n, `${G}:act:2:2`), // u2 calls in h1
      row("u1", 300n, `${G}:h1:resolve:1:WIN:0`), // u1 wins h1
      row("u1", -50n, `${G}:h2:ante:1`),
      row("u2", -50n, `${G}:h2:ante:2`),
    ];
    // Only the h2 antes are returned — h1's 100-coin bets are NOT refunded.
    expect(sorted(computeOrphanRefunds(rows))).toEqual([
      { userId: "u1", amount: 50n },
      { userId: "u2", amount: 50n },
    ]);
  });

  it("sums ante + bet within the unresolved hand", () => {
    const rows = [
      row("u1", -50n, `${G}:h1:ante:1`),
      row("u2", -50n, `${G}:h1:ante:2`),
      row("u1", -100n, `${G}:act:1:1`), // u1 raises in the orphaned hand
    ];
    expect(sorted(computeOrphanRefunds(rows))).toEqual([
      { userId: "u1", amount: 150n },
      { userId: "u2", amount: 50n },
    ]);
  });

  it("nets an in-hand foldrefund against the ante (refunds only the forfeit)", () => {
    const rows = [
      row("u1", -50n, `${G}:h1:ante:1`),
      row("u2", -50n, `${G}:h1:ante:2`),
      row("u2", 25n, `${G}:h1:foldrefund:2`), // u2 folded: 25 already back, 25 forfeit
    ];
    expect(sorted(computeOrphanRefunds(rows))).toEqual([
      { userId: "u1", amount: 50n },
      { userId: "u2", amount: 25n },
    ]);
  });

  it("returns nothing when every hand is resolved", () => {
    const rows = [
      row("u1", -50n, `${G}:h1:ante:1`),
      row("u2", -50n, `${G}:h1:ante:2`),
      row("u1", 100n, `${G}:h1:resolve:1:WIN:0`),
    ];
    expect(computeOrphanRefunds(rows)).toEqual([]);
  });

  it("returns nothing for an empty ledger", () => {
    expect(computeOrphanRefunds([])).toEqual([]);
  });

  it("is idempotent: a prior recovery refund nets the debits to zero", () => {
    // After a first reconcile wrote :recovery:refund: credits, re-running must
    // refund nothing more (the credits sit after the last resolve, netting out).
    const rows = [
      row("u1", -50n, `${G}:h2:ante:1`),
      row("u2", -50n, `${G}:h2:ante:2`),
      row("u1", 50n, `${G}:recovery:refund:u1`),
      row("u2", 50n, `${G}:recovery:refund:u2`),
    ];
    expect(computeOrphanRefunds(rows)).toEqual([]);
  });
});
