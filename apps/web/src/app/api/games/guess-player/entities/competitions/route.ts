import { NextResponse } from "next/server";
import { prisma, Prisma } from "@fb/db";
import { auth } from "@/auth";

/** Competition autocomplete — Arabic-first (verified names from
 *  competition_names_ar, e.g. "الدوري الإسباني" finds La Liga), English
 *  fallback. Non-youth competitions; prominent categories first. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ items: [] }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ items: [] });

  const normQ = q.replace(/[أإآ]/g, "ا");
  const like = `%${normQ}%`;
  // ARABIC-ONLY: only competitions with a VERIFIED Arabic name are listed;
  // English input still matches, display is Arabic with no English sub.
  const rows = await prisma.$queryRaw<{ league_id: number; name_ar: string }[]>(Prisma.sql`
    SELECT d.league_id, a.name_ar
    FROM football.competition_dim d
    JOIN football.competition_names_ar a ON a.league_id = d.league_id AND a.verified = true
    WHERE d.is_youth = false
      -- variant ids of a merged competition are never listed (canonical only)
      AND NOT EXISTS (SELECT 1 FROM football.competition_aliases al WHERE al.league_id = d.league_id)
      AND (
      d.comp_name ILIKE ${like}
      OR translate(a.name_ar, 'أإآ', 'ااا') ILIKE ${like}
    )
    ORDER BY
      CASE d.category
        WHEN 'UCL' THEN 0
        WHEN 'LEAGUE_EN' THEN 0 WHEN 'LEAGUE_ES' THEN 0 WHEN 'LEAGUE_IT' THEN 0
        WHEN 'LEAGUE_DE' THEN 0 WHEN 'LEAGUE_FR' THEN 0
        WHEN 'NATIONAL_SENIOR' THEN 1
        WHEN 'CLUB_CUP' THEN 2
        ELSE 3
      END,
      a.name_ar
    LIMIT 12
  `);
  return NextResponse.json({
    items: rows.map((r) => ({ id: String(r.league_id), label: r.name_ar, sub: null })),
  });
}
