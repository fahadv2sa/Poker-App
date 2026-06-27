import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { FriendsScreen, type FriendPerson } from "@/components/games/friends-screen";

export const dynamic = "force-dynamic";

const sel = {
  id: true,
  username: true,
  nickname: true,
  playerNumber: true,
  avatarSeed: true,
  metrics: { select: { level: true } },
  avatar: { select: { updatedAt: true } },
} as const;

type Person = {
  id: string;
  username: string;
  nickname: string | null;
  playerNumber: number;
  avatarSeed: string | null;
  metrics: { level: number } | null;
  avatar: { updatedAt: Date } | null;
};

function toPerson(p: Person): FriendPerson {
  return {
    id: p.id,
    name: p.nickname ?? p.username,
    playerNumber: p.playerNumber,
    level: p.metrics?.level ?? 1,
    avatarSrc: p.avatar ? `/api/profile/avatar/${p.id}?v=${p.avatar.updatedAt.getTime()}` : null,
    seed: p.avatarSeed ?? p.username,
  };
}

export default async function FriendsPage() {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) redirect("/login");

  const [incoming, links] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: me, status: "PENDING" },
      select: { requester: { select: sel }, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: me }, { addresseeId: me }] },
      select: { requesterId: true, requester: { select: sel }, addressee: { select: sel }, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const requests = incoming.map((r) => toPerson(r.requester));
  const friends = links.map((l) => toPerson(l.requesterId === me ? l.addressee : l.requester));

  return <FriendsScreen requests={requests} friends={friends} />;
}
