import { prisma } from "@fb/db";

/**
 * Startup recovery for the server-restart orphan case (mirrors Link Up's
 * reconcileOrphanedGames). A match's round state lives only in memory (the in-memory
 * Matches map + timers), so a crash or redeploy mid-match leaves the DB row
 * IN_PROGRESS forever — no socket leave/close ever fires for a dead room. A fresh
 * process holds no in-memory matches, so at boot EVERY IN_PROGRESS match is, by
 * definition, orphaned. Mark each ABANDONED so they don't accumulate or
 * misrepresent active play.
 *
 * Unlike Link Up there is nothing to refund (Top Ten has no wallet — only XP, which
 * is awarded per-round as the match progresses and is idempotent), so this is a
 * plain terminal-status flip. Idempotent: an ABANDONED match is skipped next boot.
 * Safe to run on every boot, BEFORE accepting traffic.
 */
export async function reconcileOrphanedMatches(): Promise<number> {
  const res = await prisma.ttMatch.updateMany({
    where: { status: "IN_PROGRESS" },
    data: { status: "ABANDONED", endedAt: new Date() },
  });
  if (res.count === 0) {
    console.log("[top-10][recovery] no orphaned in-progress matches");
  } else {
    console.log(`[top-10][recovery] marked ${res.count} orphaned match(es) ABANDONED`);
  }
  return res.count;
}
