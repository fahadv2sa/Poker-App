import {
  ACTIVITY_WRITE_THROTTLE_MS,
  SESSION_INACTIVITY_MS,
  isBotPlayerNumber,
} from "@fp/shared";
import { prisma } from "./client";

/**
 * Inactivity auto-logout — the server-side half (the threshold + write-coalescing
 * constants live in @fp/shared so the web and game-server agree). Sessions are
 * stateless JWTs (Auth.js), so there is nothing to revoke in a table; instead we
 * track `users.last_active_at` and enforce the inactivity window on access:
 *   - the web sets a rolling JWT maxAge AND calls touchUserActivity on each
 *     authenticated request (so the timestamp reflects HTTP activity);
 *   - the game-server calls isSessionInactive at the Socket.IO handshake and
 *     touchUserActivity on connect / actions.
 *
 * Both helpers are defensive: touchUserActivity never throws (activity tracking
 * must never break a request), and isSessionInactive fails OPEN (returns false)
 * on any error — including the brief window before the migration is applied — so
 * a DB hiccup can never lock everyone out. Bots are never affected.
 */

/**
 * Advance a user's `last_active_at` to now — coalesced to at most one write per
 * ACTIVITY_WRITE_THROTTLE_MS via a conditional UPDATE (the WHERE makes it a
 * zero-row no-op when the row was touched recently). Safe to call on every hot
 * path. Never throws.
 */
export async function touchUserActivity(userId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - ACTIVITY_WRITE_THROTTLE_MS);
    await prisma.user.updateMany({
      where: { id: userId, lastActiveAt: { lt: cutoff } },
      data: { lastActiveAt: new Date() },
    });
  } catch {
    // Activity tracking is best-effort — a failure here must never surface to
    // the caller (login / socket handshake / betting must keep working).
  }
}

/**
 * True iff this user's session should be treated as expired for inactivity
 * (last activity older than SESSION_INACTIVITY_MS). Bots are NEVER inactive
 * (they have no session); unknown users and any error fail OPEN (false) so the
 * inactivity check can never become a hard outage.
 */
export async function isSessionInactive(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveAt: true, playerNumber: true },
    });
    if (!user) return false; // unknown — let the normal auth path decide
    if (isBotPlayerNumber(user.playerNumber)) return false; // bots are exempt
    return Date.now() - user.lastActiveAt.getTime() > SESSION_INACTIVITY_MS;
  } catch {
    return false; // fail open: never lock everyone out on a DB error
  }
}
