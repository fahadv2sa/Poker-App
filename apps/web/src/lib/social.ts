import { prisma } from "@fp/db";

/** The relationship between the viewer and another player, from the viewer's
 *  side. REJECTED reads as "none" so a player can request again later. */
export type FriendState = "none" | "pending_out" | "pending_in" | "friends";

type FriendRow = { requesterId: string; addresseeId: string; status: string } | null;

/** The single friendship row between two users, in either direction (or null). */
export function relationRow(meId: string, otherId: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: meId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: meId },
      ],
    },
  });
}

export function friendStateOf(row: FriendRow, meId: string): FriendState {
  if (!row) return "none";
  if (row.status === "ACCEPTED") return "friends";
  if (row.status === "PENDING") return row.requesterId === meId ? "pending_out" : "pending_in";
  return "none"; // REJECTED → re-requestable
}

/** Count of ACTIVE (accepted) friendships for a user — for the profile card. */
export function friendsCount(userId: string): Promise<number> {
  return prisma.friendship.count({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
  });
}
