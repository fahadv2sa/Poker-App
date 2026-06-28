import { redirect } from "next/navigation";
import { prisma } from "@fb/db";
import { levelForXp } from "@fb/top-10-engine";
import { auth } from "@/auth";
import { TenHome } from "@/components/TenHome";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

/** Top Ten home (launcher). Server component: verifies the session and reads the
 *  player's XP/level for the level strip. */
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const prog = await prisma.ttProgression.findUnique({
    where: { userId: session.user.id },
    select: { xp: true, level: true },
  });
  const xp = Number(prog?.xp ?? 0n);
  const level = prog?.level ?? levelForXp(xp);
  const hubUrl = process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3000";

  return <TenHome level={level} xp={xp} hubUrl={hubUrl} logoutAction={logoutAction} />;
}
