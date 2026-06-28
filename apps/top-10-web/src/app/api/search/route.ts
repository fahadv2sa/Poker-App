import { NextResponse } from "next/server";
import { prisma, Prisma } from "@fb/db";
import { auth } from "@/auth";

/**
 * Filtered player search for the Top Ten input (brief §6.5). Prefix-matches the
 * FIRST or LAST name token, in Arabic OR English, against football.players —
 * read-only (no gameplay writes to football data). Returns id + both names. The
 * client only ever submits a selected id, so typos are impossible.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ players: [] }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ players: [] });

  // Prefix match on the whole name OR any internal word boundary (first/last name),
  // case-insensitive, Arabic or English. ILIKE 'q%' OR ILIKE '% q%'.
  const prefix = `${q}%`;
  const wordPrefix = `% ${q}%`;
  const rows = await prisma.$queryRaw<{ id: string; name: string; name_ar: string | null }[]>(Prisma.sql`
    SELECT id, name, name_ar
    FROM football.players
    WHERE active = true AND (
      name ILIKE ${prefix} OR name ILIKE ${wordPrefix}
      OR name_ar ILIKE ${prefix} OR name_ar ILIKE ${wordPrefix}
    )
    ORDER BY COALESCE(fame_score, 0) DESC
    LIMIT 12
  `);
  return NextResponse.json({
    players: rows.map((r) => ({ id: r.id, name: r.name, nameAr: r.name_ar ?? r.name })),
  });
}
