import { NextResponse } from "next/server";
import { prisma, Prisma } from "@fb/db";
import { auth } from "@/auth";

/** Trophy autocomplete — ONLY the curated whitelist (active rows), Arabic-
 *  first: verified Arabic label + hamza-insensitive Arabic search, English
 *  fallback. The submitted id is the row's exact (compName, country) —
 *  trophy_dim's identity, which the verification engine matches against. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ items: [] }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ items: [] });

  // ARABIC-ONLY: only whitelist trophies with a VERIFIED Arabic name are
  // listed; English input still matches, display is Arabic only.
  const like = `%${q.replace(/[أإآ]/g, "ا")}%`;
  const rows = await prisma.$queryRaw<
    { comp_name: string; country: string; name_ar: string; is_national: boolean }[]
  >(Prisma.sql`
    SELECT g.comp_name, g.country, g.name_ar,
           coalesce(t.is_national, false) AS is_national
    FROM guess_player.gp_askable_trophies g
    LEFT JOIN football.trophy_dim t
      ON t.comp_name = g.comp_name AND t.country = g.country
    WHERE g.active = true AND g.name_ar_verified AND g.name_ar IS NOT NULL AND (
      g.comp_name ILIKE ${like}
      OR translate(g.name_ar, 'أإآ', 'ااا') ILIKE ${like}
    )
    ORDER BY g.sort_order, g.name_ar
    LIMIT 12
  `);
  return NextResponse.json({
    // singleYear mirrors the competitions endpoint: national-team trophies
    // (WC/Euro/Copa…) label their season as one calendar year.
    items: rows.map((r) => ({
      id: `${r.comp_name}||${r.country}`,
      label: r.name_ar,
      sub: null,
      singleYear: r.is_national,
    })),
  });
}
