import { prisma } from "@fb/db";
import { TT_TYPE_META, type TtDifficulty, type TtQuestionType } from "@fb/shared";

/**
 * Frozen-catalog source (PLATFORM_CONTRACTS §4 read seam). Loads the ACTIVE catalog
 * generation built by `pnpm db:build-top10-catalog` into memory ONCE at boot, plus
 * the per-player display + hint attributes (nationality / club). Runtime NEVER
 * re-ranks from football.* — it serves these frozen lists, so a mid-season data
 * change can't alter a live match. Read-only; no gameplay writes to football.*.
 */

export interface CatalogPlayer {
  rank: number;
  playerId: string;
  value: number;
  name: string;
  nameAr: string;
  /** Up to 3 Arabic hint strings (nationality, club, position) for hint mode. */
  hints: string[];
}

export interface CatalogEntry {
  id: string;
  type: TtQuestionType;
  leagueId: number;
  competitionName: string;
  season: number; // window start
  seasonEnd: number; // window end (== season for a single season)
  difficulty: TtDifficulty;
  titleAr: string;
  players: CatalogPlayer[]; // ranked 1..10
}

export class CatalogSource {
  private byDifficulty = new Map<TtDifficulty, CatalogEntry[]>();
  private total = 0;

  get size(): number {
    return this.total;
  }

  async load(): Promise<void> {
    const entries = await prisma.ttCatalogEntry.findMany({
      where: { active: true },
      include: { players: { orderBy: { rank: "asc" } } },
    });
    const ids = [...new Set(entries.flatMap((e) => e.players.map((p) => p.footballPlayerId)))];
    const players = await prisma.player.findMany({
      where: { id: { in: ids } },
      include: { nationality: true, position: true, playerClubs: { include: { club: true } } },
    });
    const pById = new Map(players.map((p) => [p.id, p]));

    const buckets = new Map<TtDifficulty, CatalogEntry[]>();
    for (const e of entries) {
      const list: CatalogPlayer[] = e.players.map((cp) => {
        const p = pById.get(cp.footballPlayerId);
        const name = p?.name ?? "?";
        const nameAr = p?.nameAr ?? name;
        const hints: string[] = [];
        if (p?.nationality?.name) hints.push(`الجنسية: ${p.nationality.name}`);
        const club = p?.playerClubs?.[0]?.club?.name;
        if (club) hints.push(`أحد أنديته: ${club}`);
        if (p?.position?.nameAr) hints.push(`المركز: ${p.position.nameAr}`);
        return { rank: cp.rank, playerId: cp.footballPlayerId, value: cp.value, name, nameAr, hints };
      });
      const seasonEnd = e.seasonEnd ?? e.season;
      // "2022" for a single season; "2020–2022" for a cumulative range — the title
      // ALWAYS states the exact window so it's never misleading.
      const seasonLabel = e.season === seasonEnd ? `${e.season}` : `${e.season}–${seasonEnd}`;
      const entry: CatalogEntry = {
        id: e.id,
        type: e.type as TtQuestionType,
        leagueId: e.leagueId,
        competitionName: e.competitionName,
        season: e.season,
        seasonEnd,
        difficulty: e.difficulty as TtDifficulty,
        titleAr: `${TT_TYPE_META[e.type as TtQuestionType].nameAr} — ${e.competitionName} ${seasonLabel}`,
        players: list,
      };
      (buckets.get(entry.difficulty) ?? buckets.set(entry.difficulty, []).get(entry.difficulty)!).push(entry);
    }
    this.byDifficulty = buckets;
    this.total = entries.length;
  }

  /** A random entry for a difficulty, excluding ids already used this match. */
  pick(difficulty: TtDifficulty, exclude: ReadonlySet<string>, rng: () => number = Math.random): CatalogEntry | null {
    const pool = (this.byDifficulty.get(difficulty) ?? []).filter((e) => !exclude.has(e.id));
    if (pool.length === 0) {
      // fall back to any difficulty if this tier is exhausted mid-match
      const all = [...this.byDifficulty.values()].flat().filter((e) => !exclude.has(e.id));
      if (all.length === 0) return null;
      return all[Math.floor(rng() * all.length)]!;
    }
    return pool[Math.floor(rng() * pool.length)]!;
  }
}
