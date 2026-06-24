import { INSTALL_REWARD_AMOUNT } from "@fb/shared";
import { Prisma } from "./generated/client";
import { prisma } from "./client";
import { applyWalletTransaction } from "./wallet";

/**
 * One-time "add to home screen" reward (10,000 coins). Server-authoritative and
 * granted at most ONCE per account: in a single transaction we lock the wallet
 * row, check the per-account `installRewardAt` flag, and only if unset do we set
 * it AND credit through the append-only ledger. The flag persists across
 * uninstall/reinstall, and the ledger `reference` is per-user, so even a
 * concurrent or replayed call can never grant twice. Never call this on merely
 * seeing/dismissing the modal — only on a confirmed install (appinstalled /
 * standalone); the once-ever flag is the real anti-abuse guarantee.
 */

export interface InstallRewardResult {
  /** True only when THIS call performed the grant (false if already claimed). */
  granted: boolean;
  amount: bigint;
  balance: bigint;
}

export async function grantInstallReward(userId: string): Promise<InstallRewardResult> {
  return prisma.$transaction(async (tx) => {
    // Serialize concurrent claims for this user (lock the wallet row).
    const rows = await tx.$queryRaw<{ balance: bigint }[]>(
      Prisma.sql`SELECT balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`,
    );
    const wallet = rows[0];
    if (!wallet) return { granted: false, amount: 0n, balance: 0n };

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { installRewardAt: true },
    });
    // Already claimed (or unknown user) → no-op, return the current balance.
    if (!user || user.installRewardAt) {
      return { granted: false, amount: 0n, balance: wallet.balance };
    }

    await tx.user.update({ where: { id: userId }, data: { installRewardAt: new Date() } });
    const { balance } = await applyWalletTransaction(tx, {
      userId,
      type: "INSTALL_REWARD",
      amount: INSTALL_REWARD_AMOUNT,
      reference: `install-reward:${userId}`,
    });
    return { granted: true, amount: INSTALL_REWARD_AMOUNT, balance };
  });
}
