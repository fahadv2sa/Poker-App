// One-off admin grant: +10,000 Coins to every existing user, idempotent.
//
// Respects wallet integrity (Section 6): credits go through the canonical
// `applyWalletTransactionAtomic` primitive — per user, in one transaction it
// locks the wallet row FOR UPDATE, checks idempotency by `reference`, appends a
// wallet_transactions ledger row, and moves balance/highest_balance in lockstep.
// The deterministic `reference` makes re-runs a no-op (no double credit).
//
// Run (Railway): set DATABASE_URL inline, then:
//   pnpm --filter @fb/db exec tsx scripts/grant-bonus.ts
import { prisma } from "../src/client";
import { applyWalletTransactionAtomic } from "../src/wallet";

const AMOUNT = 10_000n;
const TYPE = "BANK_CLAIM" as const;
const REF = "admin-bonus-10k-2026-06-20";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  let credited = 0;
  let skipped = 0;
  for (const u of users) {
    const res = await applyWalletTransactionAtomic({
      userId: u.id,
      type: TYPE,
      amount: AMOUNT,
      reference: `${REF}:${u.id}`,
      metadata: { reason: "admin bonus 10k", grantedOn: "2026-06-20" },
    });
    if (res.idempotentReplay) {
      skipped++;
      console.log(`skip   ${u.username} (already granted) -> ${res.balance}`);
    } else {
      credited++;
      console.log(`+10000 ${u.username} -> ${res.balance}`);
    }
  }
  console.log(`Done. credited=${credited} skipped=${skipped} total=${users.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
