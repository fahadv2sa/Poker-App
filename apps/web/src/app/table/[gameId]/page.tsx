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
      select: { id: true, roomName: true, inviteCode: true, createdBy: true, status: true },
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
  // A closed (ABANDONED) table can never be joined — the socket would reject it
  // and the table screen would hang on "connecting…". Resolve cleanly instead:
  // send the user home with a notice, so nothing abandoned/dangling remains.
  // (ENDED/IN_PROGRESS/LOBBY are still-live sessions and render normally.)
  if (game.status === "ABANDONED") redirect("/?closed=1");

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
