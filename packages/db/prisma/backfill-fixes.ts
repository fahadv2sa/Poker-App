/**
 * One-off post-import fixes (run after the differential import completes):
 *
 *   STEP 2 — re-attach career clubs to players who lost them. The differential
 *     import's Phase 2 deletes player_clubs before the player row; for players
 *     it couldn't delete (FK to game_cards), the clubs were gone but the player
 *     survived, leaving them club-less. Re-fetch /players/teams and re-insert.
 *
 *   STEP 3 — backfill photo_url for the manually-seeded stars (external_ref NULL,
 *     no photo). Search API-Football by name; on a high-confidence name match,
 *     set ONLY photo_url. Never assign external_ref, never touch other fields.
 *
 *   pnpm --filter @fb/db exec tsx prisma/backfill-fixes.ts --daily=75000 --interval=120
 *
 * Reuses apiGet (rate-limited fetch) and the club-upsert pattern. NEVER updates
 * fame_score / tier / top5_league_seasons (it never updates the player row in
 * Step 2, and writes only photo_url in Step 3). No hard deletes, no re-inserts of
 * existing rows.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import { prisma } from "../src/client";
import { apiGet, type TeamItem } from "./import-api-football";

const DRY_RUN = process.argv.includes("--dry-run");

/** Normalize a name for comparison: lowercase, strip accents + punctuation. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface SearchItem {
  player: { id: number; name?: string | null; photo?: string | null };
}

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not set (packages/db/.env).");

  // ===== STEP 2 — re-attach career clubs to club-less players =====
  const clubless = await prisma.player.findMany({
    where: {
      externalRef: { not: null },
      playerClubs: { none: {} },
    },
    select: { id: true, name: true, externalRef: true },
    orderBy: { externalRef: "asc" },
  });
  console.log(`\n==== STEP 2 — re-attach clubs (${clubless.length} club-less players) ====`);
  const clubCache = new Map<string, string>();
  let clubsFixed = 0;
  let clubsEmpty = 0;
  let linksAdded = 0;
  for (const pl of clubless) {
    const teams = await apiGet<TeamItem>("/players/teams", { player: pl.externalRef! }, apiKey);
    const clubNames = [...new Set(teams.response.map((t) => t.team.name.trim()).filter(Boolean))];
    if (clubNames.length === 0) {
      clubsEmpty++;
      console.log(`  ~ ${pl.name} (ref ${pl.externalRef}): API returned no teams — left as-is`);
      continue;
    }
    if (!DRY_RUN) {
      for (const name of clubNames) {
        const clubId =
          clubCache.get(name) ??
          (await prisma.club.upsert({ where: { name }, update: {}, create: { name } })).id;
        clubCache.set(name, clubId);
        // player is club-less (0 links), so a plain create cannot duplicate.
        await prisma.playerClub.create({ data: { playerId: pl.id, clubId } });
        linksAdded++;
      }
    }
    clubsFixed++;
    console.log(`  + ${pl.name} (ref ${pl.externalRef}): ${clubNames.length} clubs`);
  }
  console.log(
    `STEP 2 done: ${clubsFixed} players re-clubbed (${linksAdded} links), ${clubsEmpty} had no API teams.`,
  );

  // ===== STEP 3 — backfill photo_url for manual stars (external_ref NULL) =====
  const noPhoto = await prisma.player.findMany({
    where: { externalRef: null, OR: [{ photoUrl: null }, { photoUrl: "" }] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`\n==== STEP 3 — backfill photo_url (${noPhoto.length} manual players) ====`);
  let photoSet = 0;
  let photoSkipped = 0;
  for (const pl of noPhoto) {
    const target = norm(pl.name);
    const tokens = target.split(" ");
    const surname = tokens[tokens.length - 1]!;
    const first = tokens[0]!;
    const res = await apiGet<SearchItem>("/players", { search: pl.name, season: 2024 }, apiKey);

    // High-confidence match: candidate shares the surname AND the first name (or
    // its initial), and actually has a photo.
    const match = res.response.find((r) => {
      const cn = norm(r.player.name ?? "");
      if (!cn.includes(surname)) return false;
      const ct = cn.split(" ");
      const cFirst = ct[0]!;
      const firstOk =
        tokens.length === 1 ||
        cFirst === first ||
        cFirst === first[0] ||
        first === cFirst[0] ||
        cn.includes(first);
      return firstOk && Boolean(r.player.photo);
    });

    if (match?.player.photo) {
      if (!DRY_RUN) {
        await prisma.player.update({ where: { id: pl.id }, data: { photoUrl: match.player.photo } });
      }
      photoSet++;
      console.log(`  + ${pl.name}  ←  matched "${match.player.name}" (id ${match.player.id})`);
    } else {
      photoSkipped++;
      console.log(`  ~ ${pl.name}: no confident match — skipped (photo left null)`);
    }
  }
  console.log(`STEP 3 done: ${photoSet} photos set, ${photoSkipped} skipped.`);

  console.log("\n==== BACKFILL SUMMARY ====");
  console.log(`Clubs re-attached : ${clubsFixed} players (${linksAdded} links)`);
  console.log(`Photos backfilled : ${photoSet} of ${noPhoto.length} manual players`);
  if (DRY_RUN) console.log("DRY RUN — no writes performed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
