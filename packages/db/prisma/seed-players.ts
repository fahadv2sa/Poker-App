// Owner-supplied football players (data-driven, SPEC §2/§17). This is SEPARATE
// from the game-rules seed (seed.ts seeds only Positions + HandRanks). Run it to
// populate real players so hands can be dealt. Idempotent: re-running upserts by
// name / unique club & nationality names and reconciles each player's clubs, so
// it never creates duplicates.
//
//   Run:  pnpm db:seed-players
//   Edit: change the PLAYERS list below — no code elsewhere needs touching.
//
// Loads packages/db/.env so DATABASE_URL is set on a fresh shell.
import "dotenv/config";
import { prisma } from "../src/client";

// ===========================================================================
// EDIT THIS LIST. Each player needs: name, nationality, position (GK|DEF|MID|
// FWD), and clubs (0+). nationality / club rows are created automatically.
//
// This set of 20 well-known players is sized so a FULL 6-seat table can deal
// (a deal needs seats×2 + 5 distinct active players ⇒ 17 at 6 seats) with
// headroom, and so every hand rank stays reachable:
//   • 9 Real Madrid players each with the identical full club set ["Real Madrid"]
//       ⇒ ROYAL_CLUB (≥5 identical sets) + FULL_HOUSE_CLUB (≥5 share a club)
//   • 6 Brazilians ⇒ ROYAL_NATION; 8 forwards ⇒ ROYAL_POSITION
//   • all four positions present (4 GK / 4 DEF / 4 MID / 8 FWD) ⇒ LINEUP
//   • repeated nationalities/positions/clubs across clubs ⇒ PAIR, TWO_PAIR,
//       TRIPLE, FULL_HOUSE
// (Reachable = a deal can produce it, not that every hand does.)
//
// NOTE: ROYAL_CLUB needs ≥5 players with an IDENTICAL full club set, so the Real
// Madrid players each list exactly ["Real Madrid"]. Each player keeps a single
// current club for now; give a player multiple clubs by adding to its `clubs`.
// ===========================================================================
const PLAYERS: Array<{
  name: string;
  nationality: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  clubs: string[];
}> = [
  { name: "Vinícius Júnior", nationality: "Brazil", position: "FWD", clubs: ["Real Madrid"] },
  { name: "Rodrygo", nationality: "Brazil", position: "FWD", clubs: ["Real Madrid"] },
  { name: "Endrick", nationality: "Brazil", position: "FWD", clubs: ["Real Madrid"] },
  { name: "Éder Militão", nationality: "Brazil", position: "DEF", clubs: ["Real Madrid"] },
  { name: "Marcelo", nationality: "Brazil", position: "DEF", clubs: ["Real Madrid"] },
  { name: "Gianluigi Donnarumma", nationality: "Italy", position: "GK", clubs: ["Paris Saint-Germain"] },
  { name: "Kevin De Bruyne", nationality: "Belgium", position: "MID", clubs: ["Manchester City"] },
  { name: "Rodri", nationality: "Spain", position: "MID", clubs: ["Manchester City"] },
  { name: "Erling Haaland", nationality: "Norway", position: "FWD", clubs: ["Manchester City"] },
  { name: "Mohamed Salah", nationality: "Egypt", position: "FWD", clubs: ["Liverpool"] },
  { name: "Thibaut Courtois", nationality: "Belgium", position: "GK", clubs: ["Real Madrid"] },
  { name: "Jude Bellingham", nationality: "England", position: "MID", clubs: ["Real Madrid"] },
  { name: "Kylian Mbappé", nationality: "France", position: "FWD", clubs: ["Real Madrid"] },
  { name: "Antonio Rüdiger", nationality: "Germany", position: "DEF", clubs: ["Real Madrid"] },
  { name: "Virgil van Dijk", nationality: "Netherlands", position: "DEF", clubs: ["Liverpool"] },
  { name: "Alisson", nationality: "Brazil", position: "GK", clubs: ["Liverpool"] },
  { name: "Harry Kane", nationality: "England", position: "FWD", clubs: ["Bayern Munich"] },
  { name: "Joshua Kimmich", nationality: "Germany", position: "MID", clubs: ["Bayern Munich"] },
  { name: "Lautaro Martínez", nationality: "Argentina", position: "FWD", clubs: ["Inter Milan"] },
  { name: "Emiliano Martínez", nationality: "Argentina", position: "GK", clubs: ["Aston Villa"] },
];
// ===========================================================================

async function main() {
  // Positions are seeded by `pnpm db:seed`; map code → id.
  const positions = await prisma.position.findMany();
  const positionId = new Map(positions.map((p) => [p.code, p.id]));
  if (positionId.size < 4) {
    throw new Error("Positions not seeded — run `pnpm db:seed` first.");
  }

  // Upsert nationalities (unique by name) and clubs (unique by name).
  const nationalityId = new Map<string, string>();
  for (const name of new Set(PLAYERS.map((p) => p.nationality))) {
    const n = await prisma.nationality.upsert({ where: { name }, update: {}, create: { name } });
    nationalityId.set(name, n.id);
  }
  const clubId = new Map<string, string>();
  for (const name of new Set(PLAYERS.flatMap((p) => p.clubs))) {
    const c = await prisma.club.upsert({ where: { name }, update: {}, create: { name } });
    clubId.set(name, c.id);
  }

  // Upsert players (logical key = name) and reconcile their club links.
  for (const pl of PLAYERS) {
    const data = {
      name: pl.name,
      nationalityId: nationalityId.get(pl.nationality)!,
      positionId: positionId.get(pl.position)!,
      active: true,
    };
    const existing = await prisma.player.findFirst({ where: { name: pl.name }, select: { id: true } });
    const player = existing
      ? await prisma.player.update({ where: { id: existing.id }, data })
      : await prisma.player.create({ data });

    // Clear + recreate the player's clubs so re-runs converge to the list.
    await prisma.playerClub.deleteMany({ where: { playerId: player.id } });
    for (const clubName of pl.clubs) {
      await prisma.playerClub.create({ data: { playerId: player.id, clubId: clubId.get(clubName)! } });
    }
  }

  const clubs = new Set(PLAYERS.flatMap((p) => p.clubs)).size;
  const nats = new Set(PLAYERS.map((p) => p.nationality)).size;
  console.log(`Seeded ${PLAYERS.length} players, ${nats} nationalities, ${clubs} clubs.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
