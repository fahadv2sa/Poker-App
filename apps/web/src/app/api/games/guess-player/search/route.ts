import { NextResponse } from "next/server";
import { prisma, Prisma } from "@fb/db";
import { auth } from "@/auth";

/**
 * Full-DB player search for Guess the Player (guesses + VS_HUMANS picks) —
 * the Top Ten filtered-input pattern: prefix-match first/last name, Arabic or
 * English; the client only ever submits a selected id, so typos are
 * impossible. Ordered by the NEW composite score (football.player_score),
 * famous names first.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ players: [] }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ players: [] });

  const normQ = q.replace(/[أإآ]/g, "ا");
  const prefix = `${normQ}%`;
  const wordPrefix = `% ${normQ}%`;
  const rows = await prisma.$queryRaw<
    { id: string; name: string; name_ar: string | null; nationality: string | null }[]
  >(Prisma.sql`
    SELECT p.id, p.name, p.name_ar, n.name AS nationality
    FROM football.players p
    LEFT JOIN football.nationalities n ON n.id = p.nationality_id
    LEFT JOIN football.player_score ps ON ps.player_id = p.id
    WHERE p.active = true AND (
      p.name ILIKE ${prefix} OR p.name ILIKE ${wordPrefix}
      OR translate(p.name_ar, 'أإآ', 'ااا') ILIKE ${prefix}
      OR translate(p.name_ar, 'أإآ', 'ااا') ILIKE ${wordPrefix}
    )
    ORDER BY COALESCE(ps.score, 0) DESC
    LIMIT 12
  `);
  return NextResponse.json({
    players: rows.map((r) => ({ id: r.id, name: r.name, nameAr: r.name_ar ?? r.name, nationality: r.nationality })),
  });
}
