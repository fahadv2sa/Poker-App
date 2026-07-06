import { NextResponse } from "next/server";
import { prisma, Prisma } from "@fb/db";
import { KNOWN_EXTRA_COUNTRIES, KNOWN_EXTRA_COUNTRIES_AR } from "@fb/guess-player-engine";
import { auth } from "@/auth";

/** Country autocomplete (nationality + national-team questions) — Arabic-
 *  first over the fully-curated country names, English fallback. Includes the
 *  KNOWN_EXTRA countries (e.g. Syria) that have NT evidence but no DB row.
 *  The submitted id is always the CANONICAL English name (what the engine
 *  matches on); the label is Arabic. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ items: [] }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ items: [] });

  const normQ = q.replace(/[أإآ]/g, "ا");
  const prefix = `${normQ}%`;
  // ARABIC-ONLY: label is the Arabic name, nothing English is rendered;
  // English input still matches. Countries lacking a verified Arabic name
  // (none today — fully curated) are excluded.
  const rows = await prisma.$queryRaw<{ name: string; name_ar: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (name) name, name_ar FROM (
      SELECT name, name_ar FROM football.nationalities WHERE name_ar_verified AND name_ar IS NOT NULL
      UNION
      SELECT name, name_ar FROM football.clubs
      WHERE kind = 'NATIONAL_TEAM' AND name_ar_verified AND name_ar IS NOT NULL
    ) u
    WHERE name ILIKE ${prefix}
      OR translate(name_ar, 'أإآ', 'ااا') ILIKE ${prefix}
    ORDER BY name
    LIMIT 12
  `);
  const items = rows.map((r) => ({ id: r.name, label: r.name_ar, sub: null as string | null }));
  // Extras: no DB row — match against both spellings in JS; Arabic label only.
  const lowerQ = normQ.toLowerCase();
  for (const extra of KNOWN_EXTRA_COUNTRIES) {
    const ar = KNOWN_EXTRA_COUNTRIES_AR[extra];
    if (!ar) continue;
    const en = extra.replace(/\b\w/g, (ch) => ch.toUpperCase());
    if (
      items.length < 12 &&
      (extra.startsWith(lowerQ) || ar.replace(/[أإآ]/g, "ا").startsWith(normQ))
    ) {
      items.push({ id: en, label: ar, sub: null });
    }
  }
  return NextResponse.json({ items });
}
