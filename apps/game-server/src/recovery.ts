import { prisma } from "@fp/db";
import type { LedgerMovement, RoomPersistence } from "./ports.js";

/**
 * Startup recovery for the server-restart orphan case. Round state lives only in
 * memory (store/runtimes/timers), so a crash or redeploy mid-hand leaves the DB
 * game IN_PROGRESS with antes/bets already debited from wallets but never
 * credited back — orphaned funds (no socket leave/close ever fires for a dead
 * room). A fresh process holds no in-memory rooms, so at boot EVERY IN_PROGRESS
 * game is, by definition, orphaned. This routine voids each via the ledger and
 * marks it ABANDONED — idempotent, so it is safe to run on every boot.
 *
 * The wallet ledger is the source of truth (game_players.committed_total is not
 * maintained). We refund only commitments from UNRESOLVED hands — a hand with a
 * `resolve` row already paid out and must never be refunded.
 */

/** One wallet-ledger row for a game, in chronological (created_at) order. */
export interface LedgerRow {
  userId: string;
  amount: bigint;
  reference: string;
}

export interface OrphanRefund {
  userId: string;
  amount: bigint;
}

/**
 * Pure: given a game's ledger rows IN CHRONOLOGICAL ORDER, return the refund owed
 * to each contributor for its unresolved (in-flight) hand.
 *
 * The split is POSITIONAL, not reference-parsed: bet/raise movements use a
 * `:act:` reference with no hand number, so the only reliable boundary is time.
 * The unresolved hand is exactly the rows AFTER the last settlement (`:resolve:`)
 * row — antes/bets debited there were never credited back. Earlier hands (up to
 * and including the last resolve) are completed and left untouched, so legitimate
 * winnings/losses are preserved. An in-hand foldrefund (positive) nets against
 * its ante, leaving exactly the forfeit — matching the live `close()` semantics.
 *
 * Idempotent under re-run: if a prior recovery already wrote `:recovery:refund:`
 * credits, they sit after the last resolve too and net the debits to zero → no
 * further refund.
 */
export function computeOrphanRefunds(rowsChronological: readonly LedgerRow[]): OrphanRefund[] {
  let lastResolveIdx = -1;
  rowsChronological.forEach((r, i) => {
    if (r.reference.includes(":resolve:")) lastResolveIdx = i;
  });

  const owedByUser = new Map<string, bigint>();
  for (let i = lastResolveIdx + 1; i < rowsChronological.length; i++) {
    const r = rowsChronological[i]!;
    owedByUser.set(r.userId, (owedByUser.get(r.userId) ?? 0n) + r.amount);
  }

  const refunds: OrphanRefund[] = [];
  for (const [userId, net] of owedByUser) {
    if (net < 0n) refunds.push({ userId, amount: -net });
  }
  return refunds;
}

/**
 * Find every game left IN_PROGRESS by a previous crash/restart and reconcile it:
 * refund its unresolved commitments through the ledger and mark it ABANDONED,
 * reusing `persistence.closeGame` (one transaction; FOR UPDATE + idempotent
 * reference + balance moved in lockstep). Each game is independent — a failure on
 * one is logged and the sweep continues, never blocking startup or double-paying.
 * Returns the number of games reconciled. Idempotent: a reconciled game is
 * ABANDONED, so the next boot skips it, and the refund references are stable.
 */
export async function reconcileOrphanedGames(persistence: RoomPersistence): Promise<number> {
  const orphans = await prisma.game.findMany({
    where: { status: "IN_PROGRESS" },
    select: { id: true, roomName: true },
  });

  if (orphans.length === 0) {
    console.log("[recovery] no orphaned in-progress games");
    return 0;
  }

  let reconciled = 0;
  for (const g of orphans) {
    try {
      // Chronological order is required for the positional last-resolve split.
      const rows = await prisma.walletTransaction.findMany({
        where: { gameId: g.id },
        select: { userId: true, amount: true, reference: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const refunds: LedgerMovement[] = computeOrphanRefunds(rows).map((r) => ({
        userId: r.userId,
        type: "REFUND",
        amount: r.amount,
        reference: `${g.id}:recovery:refund:${r.userId}`,
      }));
      await persistence.closeGame(g.id, refunds, 0);
      reconciled++;
      const total = refunds.reduce((s, m) => s + m.amount, 0n);
      console.log(
        `[recovery] reconciled "${g.roomName}" (${g.id}): ${refunds.length} refund(s), ${total} coins returned`,
      );
    } catch (err) {
      console.error(`[recovery] FAILED to reconcile game ${g.id} — left intact:`, err);
    }
  }
  console.log(`[recovery] done: reconciled ${reconciled}/${orphans.length} orphaned game(s)`);
  return reconciled;
}
