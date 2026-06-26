import { prisma, Prisma } from "@fb/db";

// ────────────────────────────────────────────────────────────────────────────
// Football player admin views — READ-ONLY. Surfaces every column we hold for a
// player (the rank engine never reads any of this; it keys only on nationality /
// position / clubs). Nothing here writes. All pages are force-dynamic, so an
// import is reflected on the next reload.
// ────────────────────────────────────────────────────────────────────────────

export type PositionCode = "GK" | "DEF" | "MID" | "FWD";
export type PlayerSort =
  | "fame_desc"
  | "fame_asc"
  | "name_asc"
  | "tier_asc"
  | "birth_desc"
  | "birth_asc"
  | "height_desc"
  | "weight_desc"
  | "avg_desc"
  | "avg_asc";
/** Data-quality gaps an admin can filter on (to find what needs enrichment). */
export type PlayerMissing = "photo" | "name_ar" | "fame" | "clubs" | "season_stats";
export type TournamentType = "WORLD_CUP" | "EURO_COPA" | "CHAMPIONS_LEAGUE";

export interface PlayerFilter {
  q?: string;
  nationality?: string;
  position?: PositionCode;
  tier?: number;
  legend?: boolean;
  active?: boolean;
  fameMin?: number;
  fameMax?: number;
  avgMin?: number;
  avgMax?: number;
  ratedMin?: number; // minimum rated season-lines (sample-size guard)
  club?: string;
  nationalTeam?: string;
  tournament?: TournamentType;
  tourMin?: number;
  birthYearMin?: number;
  birthYearMax?: number;
  heightMin?: number;
  heightMax?: number;
  weightMin?: number;
  weightMax?: number;
  missing?: PlayerMissing;
  sort?: PlayerSort;
}

function buildWhere(f: PlayerFilter): Prisma.PlayerWhereInput {
  const and: Prisma.PlayerWhereInput[] = [];

  const term = f.q?.trim();
  if (term) {
    const or: Prisma.PlayerWhereInput[] = [
      { name: { contains: term, mode: "insensitive" } },
      { nameAr: { contains: term } },
    ];
    if (/^\d+$/.test(term)) or.push({ externalRef: Number(term) });
    and.push({ OR: or });
  }

  if (f.nationality) and.push({ nationality: { name: f.nationality } });
  if (f.position) and.push({ position: { code: f.position } });
  if (typeof f.tier === "number") and.push({ tier: f.tier });
  if (typeof f.legend === "boolean") and.push({ isLegend: f.legend });
  if (typeof f.active === "boolean") and.push({ active: f.active });
  if (typeof f.fameMin === "number") and.push({ fameScore: { gte: f.fameMin } });
  if (typeof f.fameMax === "number") and.push({ fameScore: { lte: f.fameMax } });
  if (typeof f.avgMin === "number") and.push({ avgRating: { gte: f.avgMin } });
  if (typeof f.avgMax === "number") and.push({ avgRating: { lte: f.avgMax } });
  if (typeof f.ratedMin === "number") and.push({ avgRatingN: { gte: f.ratedMin } });
  if (f.club) {
    and.push({ playerClubs: { some: { club: { name: { contains: f.club, mode: "insensitive" } } } } });
  }
  if (f.nationalTeam) {
    and.push({ nationalTeams: { some: { club: { name: { contains: f.nationalTeam, mode: "insensitive" } } } } });
  }
  if (f.tournament || typeof f.tourMin === "number") {
    const some: Prisma.PlayerTournamentStatWhereInput = {};
    if (f.tournament) some.tournamentType = f.tournament;
    if (typeof f.tourMin === "number") some.appearances = { gte: f.tourMin };
    and.push({ tournamentStats: { some } });
  }
  if (typeof f.birthYearMin === "number") and.push({ birthYear: { gte: f.birthYearMin } });
  if (typeof f.birthYearMax === "number") and.push({ birthYear: { lte: f.birthYearMax } });
  if (typeof f.heightMin === "number") and.push({ heightCm: { gte: f.heightMin } });
  if (typeof f.heightMax === "number") and.push({ heightCm: { lte: f.heightMax } });
  if (typeof f.weightMin === "number") and.push({ weightKg: { gte: f.weightMin } });
  if (typeof f.weightMax === "number") and.push({ weightKg: { lte: f.weightMax } });

  switch (f.missing) {
    case "photo":
      and.push({ photoUrl: null });
      break;
    case "name_ar":
      and.push({ nameAr: null });
      break;
    case "fame":
      and.push({ fameScore: null });
      break;
    case "clubs":
      and.push({ playerClubs: { none: {} } });
      break;
    case "season_stats":
      and.push({ seasonStats: { none: {} } });
      break;
  }

  return and.length ? { AND: and } : {};
}

function buildOrder(sort?: PlayerSort): Prisma.PlayerOrderByWithRelationInput[] {
  switch (sort) {
    case "fame_asc":
      return [{ fameScore: { sort: "asc", nulls: "last" } }, { name: "asc" }];
    case "name_asc":
      return [{ name: "asc" }];
    case "tier_asc":
      return [{ tier: { sort: "asc", nulls: "last" } }, { fameScore: { sort: "desc", nulls: "last" } }];
    case "birth_desc":
      return [{ birthYear: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "birth_asc":
      return [{ birthYear: { sort: "asc", nulls: "last" } }, { name: "asc" }];
    case "height_desc":
      return [{ heightCm: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "weight_desc":
      return [{ weightKg: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "avg_desc":
      return [{ avgRating: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "avg_asc":
      return [{ avgRating: { sort: "asc", nulls: "last" } }, { name: "asc" }];
    case "fame_desc":
    default:
      return [{ fameScore: { sort: "desc", nulls: "last" } }, { name: "asc" }];
  }
}

export interface AdminPlayerListItem {
  id: string;
  name: string;
  nameAr: string | null;
  nationality: string;
  flagEmoji: string | null;
  position: string;
  birthYear: number | null;
  fameScore: number | null;
  tier: number | null;
  isLegend: boolean;
  legendScore: number | null;
  active: boolean;
  hasPhoto: boolean;
  photoUrl: string | null;
  heightCm: number | null;
  avgRating: number | null;
  avgRatingN: number;
}

export interface PlayersPage {
  items: AdminPlayerListItem[];
  total: number;
  take: number;
  skip: number;
}

const LIST_SELECT = {
  id: true,
  name: true,
  nameAr: true,
  birthYear: true,
  heightCm: true,
  fameScore: true,
  tier: true,
  avgRating: true,
  avgRatingN: true,
  isLegend: true,
  legendScore: true,
  active: true,
  photoUrl: true,
  nationality: { select: { name: true, flagEmoji: true } },
  position: { select: { code: true } },
} satisfies Prisma.PlayerSelect;

function toListItem(p: Prisma.PlayerGetPayload<{ select: typeof LIST_SELECT }>): AdminPlayerListItem {
  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    nationality: p.nationality.name,
    flagEmoji: p.nationality.flagEmoji,
    position: p.position.code,
    birthYear: p.birthYear,
    fameScore: p.fameScore,
    tier: p.tier,
    isLegend: p.isLegend,
    legendScore: p.legendScore,
    active: p.active,
    hasPhoto: p.photoUrl !== null,
    photoUrl: p.photoUrl,
    heightCm: p.heightCm,
    avgRating: p.avgRating,
    avgRatingN: p.avgRatingN,
  };
}

/** Paged, filterable, sortable player browse. */
export async function listPlayers(
  opts: PlayerFilter & { take?: number; skip?: number } = {},
): Promise<PlayersPage> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const skip = Math.max(opts.skip ?? 0, 0);
  const where = buildWhere(opts);

  const [rows, total] = await Promise.all([
    prisma.player.findMany({ where, select: LIST_SELECT, orderBy: buildOrder(opts.sort), take, skip }),
    prisma.player.count({ where }),
  ]);

  return { items: rows.map(toListItem), total, take, skip };
}

/** All matching players (capped) for CSV export — same filter, no pagination. */
export async function listPlayersForExport(filter: PlayerFilter, cap = 10000): Promise<AdminPlayerListItem[]> {
  const rows = await prisma.player.findMany({
    where: buildWhere(filter),
    select: LIST_SELECT,
    orderBy: buildOrder(filter.sort),
    take: cap,
  });
  return rows.map(toListItem);
}

// ── Filter options + coverage ──────────────────────────────────────────────

export interface FootballFilterOptions {
  nationalities: string[];
  positions: { code: string; nameAr: string }[];
}

/** Distinct values for the filter dropdowns (only those that have players). */
export async function getFootballFilterOptions(): Promise<FootballFilterOptions> {
  const [nats, positions] = await Promise.all([
    prisma.nationality.findMany({
      where: { players: { some: {} } },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.position.findMany({ select: { code: true, nameAr: true }, orderBy: { code: "asc" } }),
  ]);
  return {
    nationalities: nats.map((n) => n.name),
    positions: positions.map((p) => ({ code: p.code, nameAr: p.nameAr })),
  };
}

export interface FootballCoverage {
  total: number;
  active: number;
  legends: number;
  withFame: number;
  withPhoto: number;
  withNameAr: number;
  withClubs: number;
  withSeasonStats: number;
  byPosition: { code: string; nameAr: string; count: number }[];
  byTier: { tier: number | null; count: number }[];
}

/** Database-wide coverage / data-quality snapshot for the browse header. */
export async function getFootballCoverage(): Promise<FootballCoverage> {
  const [total, active, legends, withFame, withPhoto, withNameAr, withClubs, withSeasonStats, positions, tierGroups] =
    await Promise.all([
      prisma.player.count(),
      prisma.player.count({ where: { active: true } }),
      prisma.player.count({ where: { isLegend: true } }),
      prisma.player.count({ where: { fameScore: { not: null } } }),
      prisma.player.count({ where: { photoUrl: { not: null } } }),
      prisma.player.count({ where: { nameAr: { not: null } } }),
      prisma.player.count({ where: { playerClubs: { some: {} } } }),
      prisma.player.count({ where: { seasonStats: { some: {} } } }),
      prisma.position.findMany({
        select: { code: true, nameAr: true, _count: { select: { players: true } } },
        orderBy: { code: "asc" },
      }),
      prisma.player.groupBy({ by: ["tier"], _count: { _all: true } }),
    ]);

  return {
    total,
    active,
    legends,
    withFame,
    withPhoto,
    withNameAr,
    withClubs,
    withSeasonStats,
    byPosition: positions.map((p) => ({ code: p.code, nameAr: p.nameAr, count: p._count.players })),
    byTier: tierGroups
      .map((g) => ({ tier: g.tier, count: g._count._all }))
      .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99)),
  };
}

// ── Full per-player dossier ─────────────────────────────────────────────────

export interface SeasonStatRow {
  season: number;
  teamName: string | null;
  leagueName: string | null;
  leagueCountry: string | null;
  position: string | null;
  captain: boolean | null;
  shirtNumber: number | null;
  rating: number | null;
  appearances: number | null;
  lineups: number | null;
  minutes: number | null;
  subsIn: number | null;
  subsOut: number | null;
  subsBench: number | null;
  shotsTotal: number | null;
  shotsOn: number | null;
  goalsTotal: number | null;
  goalsAssists: number | null;
  goalsConceded: number | null;
  goalsSaves: number | null;
  passesTotal: number | null;
  passesKey: number | null;
  passesAccuracy: number | null;
  tacklesTotal: number | null;
  tacklesBlocks: number | null;
  tacklesInterceptions: number | null;
  duelsTotal: number | null;
  duelsWon: number | null;
  dribblesAttempts: number | null;
  dribblesSuccess: number | null;
  dribblesPast: number | null;
  foulsDrawn: number | null;
  foulsCommitted: number | null;
  cardsYellow: number | null;
  cardsYellowRed: number | null;
  cardsRed: number | null;
  penaltyWon: number | null;
  penaltyCommitted: number | null;
  penaltyScored: number | null;
  penaltyMissed: number | null;
  penaltySaved: number | null;
}

export interface AdminPlayerFull {
  id: string;
  externalRef: number | null;
  name: string;
  nameAr: string | null;
  firstName: string | null;
  lastName: string | null;
  nationality: { name: string; isoCode: string | null; flagEmoji: string | null };
  position: { code: string; nameAr: string; nameEn: string };
  birthYear: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthCountry: string | null;
  photoUrl: string | null;
  heightCm: number | null;
  weightKg: number | null;
  active: boolean;
  isLegend: boolean;
  legendScore: number | null;
  fameScore: number | null;
  tier: number | null;
  avgRating: number | null;
  avgRatingN: number;
  top5LeagueSeasons: number;
  createdAt: string;
  updatedAt: string;
  clubs: { name: string; logoUrl: string | null; country: string | null; fromYear: number | null; toYear: number | null }[];
  youthClubs: string[];
  nationalTeams: string[];
  tournaments: { type: string; appearances: number }[];
  seasons: SeasonStatRow[];
  // Computed insights.
  distinctClubs: number;
  careerFrom: number | null;
  careerTo: number | null;
  totalTournamentApps: number;
  career: { apps: number; minutes: number; goals: number; assists: number };
  completeness: number; // 0–100
  completenessParts: { label: string; present: boolean }[];
}

export async function getPlayerDetail(id: string): Promise<AdminPlayerFull | null> {
  const p = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      externalRef: true,
      name: true,
      nameAr: true,
      firstName: true,
      lastName: true,
      birthYear: true,
      birthDate: true,
      birthPlace: true,
      birthCountry: true,
      photoUrl: true,
      heightCm: true,
      weightKg: true,
      active: true,
      isLegend: true,
      legendScore: true,
      fameScore: true,
      tier: true,
      avgRating: true,
      avgRatingN: true,
      top5LeagueSeasons: true,
      createdAt: true,
      updatedAt: true,
      nationality: { select: { name: true, isoCode: true, flagEmoji: true } },
      position: { select: { code: true, nameAr: true, nameEn: true } },
      playerClubs: {
        select: { fromYear: true, toYear: true, club: { select: { name: true, logoUrl: true, country: { select: { name: true } } } } },
        orderBy: [{ fromYear: { sort: "asc", nulls: "last" } }],
      },
      nationalTeams: { select: { club: { select: { name: true } } } },
      youthClubs: { select: { club: { select: { name: true } } } },
      tournamentStats: { select: { tournamentType: true, appearances: true } },
      seasonStats: {
        orderBy: [{ season: "desc" }, { leagueName: "asc" }],
        select: {
          season: true,
          teamName: true,
          leagueName: true,
          leagueCountry: true,
          position: true,
          captain: true,
          shirtNumber: true,
          rating: true,
          appearances: true,
          lineups: true,
          minutes: true,
          subsIn: true,
          subsOut: true,
          subsBench: true,
          shotsTotal: true,
          shotsOn: true,
          goalsTotal: true,
          goalsAssists: true,
          goalsConceded: true,
          goalsSaves: true,
          passesTotal: true,
          passesKey: true,
          passesAccuracy: true,
          tacklesTotal: true,
          tacklesBlocks: true,
          tacklesInterceptions: true,
          duelsTotal: true,
          duelsWon: true,
          dribblesAttempts: true,
          dribblesSuccess: true,
          dribblesPast: true,
          foulsDrawn: true,
          foulsCommitted: true,
          cardsYellow: true,
          cardsYellowRed: true,
          cardsRed: true,
          penaltyWon: true,
          penaltyCommitted: true,
          penaltyScored: true,
          penaltyMissed: true,
          penaltySaved: true,
        },
      },
    },
  });
  if (!p) return null;

  const clubs = p.playerClubs.map((c) => ({
    name: c.club.name,
    logoUrl: c.club.logoUrl,
    country: c.club.country?.name ?? null,
    fromYear: c.fromYear,
    toYear: c.toYear,
  }));

  const fromYears = clubs.map((c) => c.fromYear).filter((y): y is number => y !== null);
  const toYears = clubs.map((c) => c.toYear).filter((y): y is number => y !== null);
  const seasons = p.seasonStats as SeasonStatRow[];

  const career = seasons.reduce(
    (acc, s) => ({
      apps: acc.apps + (s.appearances ?? 0),
      minutes: acc.minutes + (s.minutes ?? 0),
      goals: acc.goals + (s.goalsTotal ?? 0),
      assists: acc.assists + (s.goalsAssists ?? 0),
    }),
    { apps: 0, minutes: 0, goals: 0, assists: 0 },
  );

  const completenessParts = [
    { label: "الاسم العربي", present: p.nameAr !== null },
    { label: "الصورة", present: p.photoUrl !== null },
    { label: "الاسم الأول/الأخير", present: p.firstName !== null || p.lastName !== null },
    { label: "تاريخ الميلاد", present: p.birthDate !== null },
    { label: "مكان الميلاد", present: p.birthPlace !== null },
    { label: "الطول", present: p.heightCm !== null },
    { label: "الوزن", present: p.weightKg !== null },
    { label: "درجة الشهرة", present: p.fameScore !== null },
    { label: "الأندية", present: clubs.length > 0 },
    { label: "إحصائيات المواسم", present: seasons.length > 0 },
  ];
  const present = completenessParts.filter((c) => c.present).length;

  return {
    id: p.id,
    externalRef: p.externalRef,
    name: p.name,
    nameAr: p.nameAr,
    firstName: p.firstName,
    lastName: p.lastName,
    nationality: p.nationality,
    position: p.position,
    birthYear: p.birthYear,
    birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : null,
    birthPlace: p.birthPlace,
    birthCountry: p.birthCountry,
    photoUrl: p.photoUrl,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    active: p.active,
    isLegend: p.isLegend,
    legendScore: p.legendScore,
    fameScore: p.fameScore,
    tier: p.tier,
    avgRating: p.avgRating,
    avgRatingN: p.avgRatingN,
    top5LeagueSeasons: p.top5LeagueSeasons,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    clubs,
    youthClubs: p.youthClubs.map((y) => y.club.name),
    nationalTeams: p.nationalTeams.map((n) => n.club.name),
    tournaments: p.tournamentStats.map((t) => ({ type: t.tournamentType, appearances: t.appearances })),
    seasons,
    distinctClubs: clubs.length,
    careerFrom: fromYears.length ? Math.min(...fromYears) : null,
    careerTo: toYears.length ? Math.max(...toYears) : null,
    totalTournamentApps: p.tournamentStats.reduce((a, t) => a + t.appearances, 0),
    career,
    completeness: Math.round((present / completenessParts.length) * 100),
    completenessParts,
  };
}
