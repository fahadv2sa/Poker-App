import { prisma } from "@fp/db";
import { BOT_PLAYER_NUMBER_BASE } from "@fp/shared";

/**
 * Bot identities (Model B): each bot is a lightweight real `users` row in the
 * RESERVED player_number block (>= BOT_PLAYER_NUMBER_BASE), so the web client
 * resolves its name/avatar/profile through the SAME endpoints as any human (by
 * player_number) with zero client changes. The (Phase 5) importer seeds those
 * rows + avatars + fabricated display stats; this module just reads them.
 *
 * Until Phase 5 runs, the query returns an empty list — so with BOTS_ENABLED on
 * but no identities seeded, the pool is empty and nothing seats a bot (the game
 * behaves as if bots were off). Enable BOTS_ENABLED only after seeding.
 */

export interface BotIdentity {
  /** DB user id (uuid). */
  userId: string;
  /** Reserved player_number (>= BOT_PLAYER_NUMBER_BASE). Stable seed for the
   *  bot's personality (see strategy.personalityForSeed) and the bot marker. */
  playerNumber: number;
  /** Human-looking display name shown at the seat (the user's nickname). */
  nickname: string;
  /** The DB username (slug); kept for completeness. */
  username: string;
}

/** Load every seeded bot identity from the reserved player_number block. */
export async function loadBotIdentities(): Promise<BotIdentity[]> {
  const rows = await prisma.user.findMany({
    where: { playerNumber: { gte: BOT_PLAYER_NUMBER_BASE } },
    select: { id: true, playerNumber: true, username: true, nickname: true },
  });
  return rows.map((r) => ({
    userId: r.id,
    playerNumber: r.playerNumber,
    nickname: r.nickname ?? r.username,
    username: r.username,
  }));
}
