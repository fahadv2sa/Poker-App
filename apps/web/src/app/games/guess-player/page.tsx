import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { GpHome } from "@/components/guess-player/GpHome";

export const dynamic = "force-dynamic";

/** Guess the Player home (launcher). Server component: verifies the session
 *  and computes the player's global rank for the rank strip (mirrors Top
 *  Ten's home; gp_progression is humans-only — no bots in this game). */
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const myProg = await prisma.gpProgression.findUnique({
    where: { userId },
    select: { level: true, xp: true },
  });
  const myLevel = myProg?.level ?? 1;
  const myXp = myProg?.xp ?? 0n;
  const rankNum =
    (await prisma.gpProgression.count({
      where: { OR: [{ level: { gt: myLevel } }, { level: myLevel, xp: { gt: myXp } }] },
    })) + 1;
  const rank = `#${rankNum.toLocaleString("en-US")}`;

  return <GpHome rank={rank} hubUrl="/" />;
}
