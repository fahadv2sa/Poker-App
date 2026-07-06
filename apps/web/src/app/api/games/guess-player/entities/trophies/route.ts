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
  const rows = await prisma.$queryRaw<{ comp_name: string; country: string; name_ar: string }[]>(Prisma.sql`
    SELECT comp_name, country, name_ar
    FROM guess_player.gp_askable_trophies
    WHERE active = true AND name_ar_verified AND name_ar IS NOT NULL AND (
      comp_name ILIKE ${like}
      OR translate(name_ar, 'أإآ', 'ااا') ILIKE ${like}
    )
    ORDER BY sort_order, name_ar
    LIMIT 12
  `);
  return NextResponse.json({
    items: rows.map((r) => ({
      id: `${r.comp_name}||${r.country}`,
      label: r.name_ar,
      sub: null,
    })),
  });
}
