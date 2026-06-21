/**
 * One-off admin top-up: bring every wallet up to 50,000 coins through the
 * append-only ledger (NOT a direct balance write). Reuses the wallet primitive
 * `applyWalletTransactionAtomic` (FOR UPDATE + idempotent reference + balanceAfter
 * in lockstep), so balance == Σ(ledger) stays exact. Idempotent per user via a
 * fixed reference — safe to re-run and safe to run on local + prod independently.
 *
 *   # local:
 *   pnpm --filter @fp/db exec tsx prisma/topup-wallets.ts
 *   # prod:
 *   DATABASE_URL="<prod-url>" NODE_OPTIONS=--use-system-ca \
 *     pnpm --filter @fp/db exec tsx prisma/topup-wallets.ts
 */
import "dotenv/config";
import { applyWalletTransactionAtomic } from "../src/wallet";
import { prisma } from "../src/client";

const TARGET = 50_000n;
const REF_PREFIX = "admin-topup-50k-2026-06-21:";

async function main() {
  const wallets = await prisma.wallet.findMany({
    where: { balance: { lt: TARGET } },
    select: { userId: true, balance: true },
  });
  console.log(`wallets below ${TARGET}: ${wallets.length}`);

  let credited = 0;
  let replays = 0;
  for (const w of wallets) {
    const amount = TARGET - w.balance;
    if (amount <= 0n) continue;
    const res = await applyWalletTransactionAtomic({
      userId: w.userId,
      type: "BANK_CLAIM", // existing credit/top-up type; does NOT touch the bank
      amount, //            rate limit (that counts BankClaim rows, not written here)
      reference: `${REF_PREFIX}${w.userId}`,
      metadata: { reason: "admin top-up to 50000", added: Number(amount) },
    });
    if (res.idempotentReplay) replays++;
    else credited++;
  }
  console.log(`credited: ${credited} | idempotent replays: ${replays}`);

  // --- verification ---------------------------------------------------------
  const total = await prisma.wallet.count();
  const at50k = await prisma.wallet.count({ where: { balance: TARGET } });
  const below = await prisma.wallet.count({ where: { balance: { lt: TARGET } } });
  console.log(`wallets: ${total} | exactly 50000: ${at50k} | still below: ${below}`);

  // Reconciliation: balance MUST equal the sum of that user's ledger amounts.
  const mism = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM wallets w
     WHERE w.balance <> (
       SELECT COALESCE(sum(amount), 0) FROM wallet_transactions t WHERE t.user_id = w.user_id
     )`,
  );
  console.log(`balance != Σ(ledger) wallets (MUST be 0): ${mism[0]!.n}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
