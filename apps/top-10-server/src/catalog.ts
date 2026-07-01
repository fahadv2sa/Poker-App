import { prisma } from "@fb/db";
import { TT_TYPE_META, ttSeasonLabel, type TtDifficulty, type TtQuestionType } from "@fb/shared";

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
  /** Player photo (football.players.photo_url) so a revealed card shows the face;
   *  null → the client falls back to an initials tile. */
  photoUrl: string | null;
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
      const type = e.type as TtQuestionType;
      const meta = TT_TYPE_META[type];
      // A hint must never restate what the question title already says.
      // CLUB-scoped: every answer is already that club's player, so identify the scoped
      // club data-drivenly (the club shared by the answers) and never offer it as a hint.
      let scopedClubName: string | null = null;
      if (e.clubKey) {
        const freq = new Map<string, number>();
        for (const cp of e.players) {
          const pl = pById.get(cp.footballPlayerId);
          for (const c of new Set((pl?.playerClubs ?? []).map((pc) => pc.club?.name).filter((n): n is string => !!n))) {
            freq.set(c, (freq.get(c) ?? 0) + 1);
          }
        }
        scopedClubName = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      }

      const list: CatalogPlayer[] = e.players.map((cp) => {
        const p = pById.get(cp.footballPlayerId);
        const name = p?.name ?? "?";
        const nameAr = p?.nameAr ?? name;
        const hints: string[] = [];
        if (p?.nationality?.name) hints.push(`الجنسية: ${p.nationality.name}`);
        // Offer a DIFFERENT club from the player's career — never the scoped club, and
        // never a reserve / "B" side (a hint must name a FIRST team). Omitted entirely
        // if they have no other senior club.
        const clubName = (p?.playerClubs ?? [])
          .filter((pc) => pc.club && !pc.club.isReserve)
          .map((pc) => pc.club!.name)
          .find((n): n is string => n !== scopedClubName);
        if (clubName) hints.push(`أحد أنديته: ${clubName}`);
        // Skip the position hint when the question is already position-scoped (the title
        // says المدافعين / لاعبي الوسط / الحراس), otherwise it just restates the title.
        if (p?.position?.nameAr && !meta.position) hints.push(`المركز: ${p.position.nameAr}`);
        return { rank: cp.rank, playerId: cp.footballPlayerId, value: cp.value, name, nameAr, photoUrl: p?.photoUrl ?? null, hints };
      });
      const seasonEnd = e.seasonEnd ?? e.season;
      // The exact season window, league-aware: cross-calendar competitions render the
      // real two-year span ("2019/2020"); single-year tournaments (WC/Euro/Copa) stay
      // one year. Derived from the SAME stored season/leagueId the list was built from,
      // so the displayed season can never disagree with the answers (verified mapping).
      const seasonLabel = ttSeasonLabel(e.season, seasonEnd, e.leagueId);
      const entry: CatalogEntry = {
        id: e.id,
        type,
        leagueId: e.leagueId,
        competitionName: e.competitionName,
        season: e.season,
        seasonEnd,
        difficulty: e.difficulty as TtDifficulty,
        titleAr: `${meta.nameAr} — ${e.competitionName} ${seasonLabel}`,
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
