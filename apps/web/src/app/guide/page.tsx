import { redirect } from "next/navigation";
import { HAND_RANK_CATALOG } from "@fb/shared";
import { prisma } from "@fb/db";
import { auth } from "@/auth";
import { LuHeader, LuScreen } from "@/components/games/lu-screen";
import { GuideIcon } from "@/components/games/lu-icons";
import { HowToPlay } from "./how-to-play";

/**
 * "كيف تلعب" (How to Play) hub. Three tap-to-reveal cards:
 *   1. دليل الترابطات   — the nine associations, from the shared HAND_RANK_CATALOG
 *      (the same source the engine and seed use; not duplicated here).
 *   2. شرح طريقة اللعب  — beginner guidance on round flow, betting, win/lose.
 *   3. شرح الشارات      — the active badge rows, the SAME data-driven source the
 *      stats page reads, so inserting a badge row updates this card automatically.
 */
export default async function GuidePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const badges = await prisma.badge.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, icon: true, nameAr: true, descriptionAr: true },
  });

  const ranks = [...HAND_RANK_CATALOG]
    .sort((a, b) => b.strength - a.strength)
    .map((h) => ({ code: h.code, nameAr: h.nameAr, nameEn: h.nameEn, descriptionAr: h.descriptionAr }));

  return (
    <LuScreen>
      <LuHeader icon={<GuideIcon size={22} />} title="كيف تلعب" subtitle="كل ما تحتاجه للبدء" />
      <p className="mb-4 mt-2 text-sm leading-relaxed text-[var(--lu-tan)]">
        اضغط أي بطاقة لعرض تفاصيلها.
      </p>
      <HowToPlay ranks={ranks} badges={badges} />
    </LuScreen>
  );
}
