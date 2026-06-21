import Link from "next/link";
import { redirect } from "next/navigation";
import { HAND_RANK_CATALOG } from "@fp/shared";
import { prisma } from "@fp/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
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
    <main className="mx-auto max-w-3xl px-4 pb-6 sm:px-6 sm:pb-10 page-top">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          كيف تلعب
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        كل ما تحتاجه للبدء — اضغط أي بطاقة لعرض تفاصيلها.
      </p>

      <HowToPlay ranks={ranks} badges={badges} />
    </main>
  );
}
