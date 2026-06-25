import { randomUUID } from "node:crypto";
import { applyWalletTransactionAtomic, getWalletBalance } from "@fb/db";
import { recordAdminAction } from "../audit.js";
import { AdminActionError } from "../errors.js";

export interface AdjustWalletResult {
  balanceBefore: string;
  balanceAfter: string;
  amount: string;
}

/**
 * Ledger-safe admin balance correction. Routes through the canonical
 * `applyWalletTransactionAtomic` primitive (row-lock + idempotency + the
 * balance>=0 invariant) as an `ADMIN_ADJUST` movement — NEVER a direct
 * `wallets.balance` write. A debit that would overdraw throws
 * `InsufficientFundsError` (from @fb/db). Records an audit row with before/after.
 *
 * `amount` is signed: positive = credit, negative = debit. The `reference` is a
 * fresh server-generated UUID, so each call is a distinct, idempotent ledger row.
 */
export async function adminAdjustWallet(opts: {
  actorUserId: string;
  targetUserId: string;
  amount: bigint;
  reason: string;
  ip?: string;
}): Promise<AdjustWalletResult> {
  if (opts.amount === 0n) {
    throw new AdminActionError("NONZERO", "amount must be non-zero");
  }

  const before = await getWalletBalance(opts.targetUserId);
  const res = await applyWalletTransactionAtomic({
    userId: opts.targetUserId,
    type: "ADMIN_ADJUST",
    amount: opts.amount,
    reference: `admin-adjust:${randomUUID()}`,
    metadata: { reason: opts.reason, actorUserId: opts.actorUserId },
  });

  await recordAdminAction({
    actorUserId: opts.actorUserId,
    action: "coins.adjust",
    targetType: "user",
    targetId: opts.targetUserId,
    before: { balance: before.toString() },
    after: {
      balance: res.balance.toString(),
      amount: opts.amount.toString(),
      reason: opts.reason,
    },
    ip: opts.ip,
  });

  return {
    balanceBefore: before.toString(),
    balanceAfter: res.balance.toString(),
    amount: opts.amount.toString(),
  };
}
