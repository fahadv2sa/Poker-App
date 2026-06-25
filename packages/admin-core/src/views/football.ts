import { prisma } from "@fb/db";

export interface AdminPlayerListItem {
  id: string;
  name: string;
  nameAr: string | null;
  nationality: string;
  position: string;
  fameScore: number | null;
  tier: number | null;
  isLegend: boolean;
  legendScore: number | null;
  active: boolean;
}

export interface PlayersPage {
  items: AdminPlayerListItem[];
  total: number;
  take: number;
  skip: number;
}

/** Paged football-player browse with search by name (Latin or Arabic). */
export async function listPlayers(
  opts: { q?: string; take?: number; skip?: number } = {},
): Promise<PlayersPage> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const skip = Math.max(opts.skip ?? 0, 0);
  const term = opts.q?.trim();
  const where = term
    ? {
        OR: [
          { name: { contains: term, mode: "insensitive" as const } },
          { nameAr: { contains: term } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.player.findMany({
      where,
      select: {
        id: true,
        name: true,
        nameAr: true,
        fameScore: true,
        tier: true,
        isLegend: true,
        legendScore: true,
        active: true,
        nationality: { select: { name: true } },
        position: { select: { code: true } },
      },
      orderBy: [{ fameScore: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      take,
      skip,
    }),
    prisma.player.count({ where }),
  ]);

  const items: AdminPlayerListItem[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    nationality: p.nationality.name,
    position: p.position.code,
    fameScore: p.fameScore,
    tier: p.tier,
    isLegend: p.isLegend,
    legendScore: p.legendScore,
    active: p.active,
  }));

  return { items, total, take, skip };
}

export interface AdminPlayerDetail extends AdminPlayerListItem {
  externalRef: number | null;
  birthYear: number | null;
  clubs: string[];
  nationalTeams: string[];
}

export async function getPlayerDetail(id: string): Promise<AdminPlayerDetail | null> {
  const p = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      nameAr: true,
      externalRef: true,
      birthYear: true,
      fameScore: true,
      tier: true,
      isLegend: true,
      legendScore: true,
      active: true,
      nationality: { select: { name: true } },
      position: { select: { code: true } },
      playerClubs: { select: { club: { select: { name: true } } } },
      nationalTeams: { select: { club: { select: { name: true } } } },
    },
  });
  if (!p) return null;

  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    externalRef: p.externalRef,
    birthYear: p.birthYear,
    nationality: p.nationality.name,
    position: p.position.code,
    fameScore: p.fameScore,
    tier: p.tier,
    isLegend: p.isLegend,
    legendScore: p.legendScore,
    active: p.active,
    clubs: p.playerClubs.map((c) => c.club.name),
    nationalTeams: p.nationalTeams.map((c) => c.club.name),
  };
}
