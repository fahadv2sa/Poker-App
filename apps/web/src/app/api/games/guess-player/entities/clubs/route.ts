import { NextResponse } from "next/server";
import { prisma, Prisma, gpCountryLikeClubNames } from "@fb/db";
import { auth } from "@/auth";

/** Club autocomplete for the question composer — Arabic-first: matches the
 *  VERIFIED Arabic name (hamza-insensitive) OR the English name; the label is
 *  Arabic when verified, English fallback otherwise (strict names policy).
 *  Real clubs only (kind=CLUB, country-named pseudo-clubs excluded). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ items: [] }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ items: [] });

  const normQ = q.replace(/[أإآ]/g, "ا");
  const prefix = `${normQ}%`;
  const wordPrefix = `% ${normQ}%`;
  const pseudo = (await gpCountryLikeClubNames()).map((n) => n.toLowerCase());
  const pseudoFilter =
    pseudo.length > 0
      ? Prisma.sql`AND lower(c.name) NOT IN (${Prisma.join(pseudo)})`
      : Prisma.empty;
  // ARABIC-ONLY (owner ruling): only clubs with a VERIFIED Arabic name are
  // listed; the label is Arabic with no English anywhere. English typed input
  // still MATCHES (the name column participates in the WHERE), it just isn't
  // rendered.
  const rows = await prisma.$queryRaw<{ id: string; name_ar: string }[]>(Prisma.sql`
    SELECT c.id, c.name_ar
    FROM football.clubs c
    WHERE c.kind = 'CLUB' AND c.name_ar_verified AND c.name_ar IS NOT NULL AND (
      c.name ILIKE ${prefix} OR c.name ILIKE ${wordPrefix}
      OR translate(c.name_ar, 'أإآ', 'ااا') ILIKE ${prefix}
      OR translate(c.name_ar, 'أإآ', 'ااا') ILIKE ${wordPrefix}
    )
    ${pseudoFilter}
    ORDER BY (SELECT count(*) FROM football.player_clubs pc WHERE pc.club_id = c.id) DESC, c.name_ar
    LIMIT 12
  `);
  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, label: r.name_ar, sub: null })),
  });
}
