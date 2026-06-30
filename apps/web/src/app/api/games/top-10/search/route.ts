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

  // Drop the hamza distinction on alef: a name typed with a bare alef ("ايريكسن")
  // must match one stored with a hamza ("إيريكسن"), and vice-versa. Normalize أ/إ/آ → ا
  // on BOTH the query (here) and the stored column (translate(...) in SQL), so the
  // comparison is hamza-insensitive.
  const normQ = q.replace(/[أإآ]/g, "ا");
  // Prefix match on the whole name OR any internal word boundary (first/last name),
  // case-insensitive, Arabic or English. ILIKE 'q%' OR ILIKE '% q%'.
  const prefix = `${normQ}%`;
  const wordPrefix = `% ${normQ}%`;
  // Return the nationality too, so identical names (e.g. two "دياز") are
  // distinguishable in the dropdown — the contestant can pick the right player.
  const rows = await prisma.$queryRaw<{ id: string; name: string; name_ar: string | null; nationality: string | null }[]>(Prisma.sql`
    SELECT p.id, p.name, p.name_ar, n.name AS nationality
    FROM football.players p
    LEFT JOIN football.nationalities n ON n.id = p.nationality_id
    WHERE p.active = true AND (
      p.name ILIKE ${prefix} OR p.name ILIKE ${wordPrefix}
      OR translate(p.name_ar, 'أإآ', 'ااا') ILIKE ${prefix}
      OR translate(p.name_ar, 'أإآ', 'ااا') ILIKE ${wordPrefix}
    )
    ORDER BY COALESCE(p.fame_score, 0) DESC
    LIMIT 12
  `);
  return NextResponse.json({
    players: rows.map((r) => ({ id: r.id, name: r.name, nameAr: r.name_ar ?? r.name, nationality: r.nationality })),
  });
}
