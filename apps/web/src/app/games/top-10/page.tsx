import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { TenHome } from "@/components/top-10/TenHome";

export const dynamic = "force-dynamic";

/** Top Ten home (launcher). Server component: verifies the session and computes the
 *  player's global rank for the rank strip (mirrors Link Up's home). */
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Global rank = position among all players by LEVEL (XP tiebreak) — the same
  // ordering as the /rank leaderboard the strip opens. Bots never get a
  // ttProgression row, so the table is humans-only; one cheap count.
  const myProg = await prisma.ttProgression.findUnique({
    where: { userId },
    select: { level: true, xp: true },
  });
  const myLevel = myProg?.level ?? 1;
  const myXp = myProg?.xp ?? 0n;
  const rankNum =
    (await prisma.ttProgression.count({
      where: { OR: [{ level: { gt: myLevel } }, { level: myLevel, xp: { gt: myXp } }] },
    })) + 1;
  const rank = `#${rankNum.toLocaleString("en-US")}`;

  // Unified platform: the hub is the same-origin root of this web service.
  return <TenHome rank={rank} hubUrl="/" />;
}
