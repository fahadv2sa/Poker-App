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

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, roomName: true, inviteCode: true, createdBy: true },
  });
  if (!game) notFound();

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
      roomName={game.roomName}
      isHost={game.createdBy === session.user.id}
    />
  );
}
