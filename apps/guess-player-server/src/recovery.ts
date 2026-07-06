import { prisma } from "@fb/db";

/**
 * Startup recovery (mirrors Link Up / Top Ten). Match state lives only in
 * memory, so a crash or redeploy mid-match leaves DB rows IN_PROGRESS
 * forever. A fresh process holds no matches → every IN_PROGRESS row is by
 * definition orphaned; mark each ABANDONED. Nothing to refund (points/XP
 * only, awarded per-round and idempotent). Idempotent; runs before traffic.
 */
export async function reconcileOrphanedMatches(): Promise<number> {
  const res = await prisma.gpMatch.updateMany({
    where: { status: "IN_PROGRESS" },
    data: { status: "ABANDONED", endedAt: new Date() },
  });
  if (res.count === 0) {
    console.log("[guess-player][recovery] no orphaned in-progress matches");
  } else {
    console.log(`[guess-player][recovery] marked ${res.count} orphaned match(es) ABANDONED`);
  }
  return res.count;
}
