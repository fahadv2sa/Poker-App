// One-off: safely abandon a single orphaned in-progress game (a pre-lifecycle
// table left IN_PROGRESS by a server restart). Voids ONLY the unresolved hand —
// refunding each player's still-committed coins through the wallet ledger (FOR
// UPDATE + idempotent reference, balance moved in lockstep) — and marks the game
// ABANDONED, all in ONE transaction. Completed hands (those with a `resolve` row)
// are left untouched, so legitimate winnings/losses are preserved.
//
// NOTE: now redundant for crash recovery — the game-server reconciles orphaned
// IN_PROGRESS games automatically at boot (src/recovery.ts). Kept as a manual
// tool for targeting a specific game on demand.
//
// Run (Railway): set DATABASE_URL inline, then:
//   pnpm --filter @fp/db exec tsx scripts/abandon-game.ts <gameId>
import { prisma } from "../src/client";
import { applyWalletTransaction } from "../src/wallet";

const gameId = process.argv[2];
if (!gameId) {
  console.error("usage: tsx prisma/abandon-game.ts <gameId>");
  process.exit(1);
}

/** Hand tag (h1/h2/…) and stage (ante/act/foldrefund/resolve) from a reference
 *  shaped `<gameId>:h<N>:<stage>:…`. The gameId is a UUID (no colons). */
function parseRef(reference: string): { hand: string; stage: string } {
  const parts = reference.split(":");
  return { hand: parts[1] ?? "", stage: parts[2] ?? "" };
}

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { id: true, status: true, roomName: true },
    });
    if (!game) throw new Error(`game ${gameId} not found`);

    const rows = await tx.walletTransaction.findMany({
      where: { gameId },
      select: { userId: true, amount: true, reference: true },
    });

    // Hands that reached settlement are DONE — never refund them.
    const resolvedHands = new Set(
      rows.filter((r) => parseRef(r.reference).stage === "resolve").map((r) => parseRef(r.reference).hand),
    );

    // Per user: coins committed in any UNRESOLVED hand (debits negative; an
    // in-hand foldrefund nets out, leaving exactly the forfeit). Refund the rest.
    const owed = new Map<string, bigint>();
    for (const r of rows) {
      if (resolvedHands.has(parseRef(r.reference).hand)) continue;
      owed.set(r.userId, (owed.get(r.userId) ?? 0n) + r.amount);
    }

    const applied: { userId: string; refund: bigint; balance: bigint }[] = [];
    for (const [userId, net] of owed) {
      const refund = net < 0n ? -net : 0n;
      if (refund === 0n) continue;
      const { balance } = await applyWalletTransaction(tx, {
        userId,
        type: "REFUND",
        amount: refund,
        reference: `${gameId}:abandonrefund:${userId}`,
        gameId,
        metadata: { reason: "abandon orphaned in-progress game", voidedHands: "unresolved" },
      });
      applied.push({ userId, refund, balance });
    }

    await tx.game.update({
      where: { id: gameId },
      data: { status: "ABANDONED", phase: "ENDED", endedAt: new Date(), pot: 0n },
    });

    return { roomName: game.roomName, prevStatus: game.status, resolvedHands: [...resolvedHands], applied };
  });

  console.log(`Abandoned "${result.roomName}" (was ${result.prevStatus}).`);
  console.log(`Preserved resolved hands: ${result.resolvedHands.join(", ") || "(none)"}`);
  for (const a of result.applied) {
    console.log(`  REFUND +${a.refund} -> ${a.userId} (balance ${a.balance})`);
  }
  if (result.applied.length === 0) console.log("  (no unresolved commitments to refund)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
