import { notFound, redirect } from "next/navigation";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { GameTable } from "@/components/table/game-table";
import { signRealtimeToken } from "@/lib/realtime-token";

export default async function TablePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [game, wallet, user] = await Promise.all([
    prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, roomName: true, inviteCode: true, createdBy: true },
    }),
    prisma.wallet.findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { nickname: true },
    }),
  ]);
  if (!game) notFound();

  // Display name shown at the player's own seat: their chosen nickname, falling
  // back to the username, then a generic label. Never empty.
  const displayName = user?.nickname?.trim() || session.user.name || "لاعب";

  // Identity comes from the verified session — minted into a signed token the
  // client cannot forge. The browser never sends a raw userId.
  const token = await signRealtimeToken({
    userId: session.user.id,
    username: session.user.name ?? "لاعب",
    playerNumber: session.user.playerNumber,
  });

  return (
    <GameTable
      token={token}
      inviteCode={game.inviteCode}
      isHost={game.createdBy === session.user.id}
      initialBalance={Number(wallet?.balance ?? 0n)}
      nickname={displayName}
    />
  );
}
