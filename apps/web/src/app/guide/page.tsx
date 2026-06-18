import Link from "next/link";
import { redirect } from "next/navigation";
import { HAND_RANK_CATALOG } from "@fp/shared";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Read-only guide to the nine football associations. Names and conditions come
 * straight from the shared HAND_RANK_CATALOG (the same source the engine and
 * seed use) — nothing is invented or duplicated here. Strongest (1) to weakest.
 */
export default async function GuidePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const hands = [...HAND_RANK_CATALOG].sort((a, b) => b.strength - a.strength);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="size-3 rounded-full bg-primary glow-primary" />
          دليل الترابطات
        </div>
        <Button asChild variant="ghost">
          <Link href="/">← القائمة</Link>
        </Button>
      </header>

      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        الترابطات مرتّبة من الأقوى (1) إلى الأضعف. عند الكشف يفوز صاحب الترابط الأقوى المُحقّق.
      </p>

      <div className="flex flex-col gap-3">
        {hands.map((h, i) => (
          <Card key={h.code} className="flex items-start gap-4 p-4 sm:p-5">
            <span className="num grid size-9 shrink-0 place-items-center rounded-full border border-gold/50 bg-gold/10 text-base font-black text-gold">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-lg font-extrabold text-foreground">{h.nameAr}</h2>
                <span className="text-xs text-muted-foreground">{h.nameEn}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{h.descriptionAr}</p>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
