import {
  answerQuestion,
  type GpDifficulty,
  type GpFactPack,
  type GpQuestion,
} from "@fb/guess-player-engine";
import type { GpAskInput } from "@fb/shared";
import {
  gpResolveClub,
  gpResolveCompetition,
  gpResolveCountry,
  gpResolvePlayer,
  gpResolveTrophy,
  gpVsSystemPoolIds,
  loadGpFactPack,
  type GpPlayerRef,
} from "@fb/db";

/**
 * Football-data port for the match orchestrator (PLATFORM_CONTRACTS §4 —
 * callers never touch Prisma or the DB shape; tests swap in a fake). All
 * reads are read-only; the engine's answerQuestion stays pure.
 */

export interface ResolvedAsk {
  /** Engine question (entities validated + trophy leagueIds attached). */
  q: GpQuestion;
  /** Frozen display labels persisted with the question. */
  params: Record<string, string | number>;
}

export interface GpFactsSource {
  /** Random hidden player for a VS_SYSTEM round. `difficulty` null = the
   *  whole dealable pool (used for the VS_HUMANS pick-timeout auto-pick). */
  pickHidden(
    difficulty: GpDifficulty | null,
    excludeIds: ReadonlySet<string>,
  ): Promise<{ ref: GpPlayerRef; pack: GpFactPack } | null>;
  /** Load a specific player (VS_HUMANS pick — full DB). */
  loadHidden(playerId: string): Promise<{ ref: GpPlayerRef; pack: GpFactPack } | null>;
  /** Validate + resolve a structured ask; null = unresolvable entity. */
  resolveAsk(input: GpAskInput): Promise<ResolvedAsk | null>;
  /** Resolve a guessed player id (public feedback + reveal). */
  resolvePlayer(playerId: string): Promise<GpPlayerRef | null>;
}

export const answer = answerQuestion;

export class PrismaGpFactsSource implements GpFactsSource {
  /** Tier pools are stable between data imports — cache per process. */
  private pools = new Map<string, string[]>();

  private async pool(difficulty: GpDifficulty | null): Promise<string[]> {
    const key = difficulty ?? "ALL";
    const cached = this.pools.get(key);
    if (cached) return cached;
    const ids = difficulty
      ? await gpVsSystemPoolIds(difficulty)
      : [
          ...(await gpVsSystemPoolIds("EASY")),
          ...(await gpVsSystemPoolIds("MEDIUM")),
          ...(await gpVsSystemPoolIds("HARD")),
        ];
    this.pools.set(key, ids);
    return ids;
  }

  async pickHidden(difficulty: GpDifficulty | null, excludeIds: ReadonlySet<string>) {
    const pool = await this.pool(difficulty);
    const eligible = pool.filter((id) => !excludeIds.has(id));
    if (eligible.length === 0) return null;
    const id = eligible[Math.floor(Math.random() * eligible.length)]!;
    return this.loadHidden(id);
  }

  async loadHidden(playerId: string) {
    const ref = await gpResolvePlayer(playerId);
    if (!ref) return null;
    return { ref, pack: await loadGpFactPack(playerId) };
  }

  async resolveAsk(input: GpAskInput): Promise<ResolvedAsk | null> {
    switch (input.template) {
      case "CLUB_EVER": {
        const club = await gpResolveClub(input.clubId);
        return club
          ? { q: { template: "CLUB_EVER", clubId: club.id }, params: { clubName: club.nameAr } }
          : null;
      }
      case "CLUB_SEASON": {
        const club = await gpResolveClub(input.clubId);
        return club
          ? {
              q: { template: "CLUB_SEASON", clubId: club.id, season: input.season },
              params: { clubName: club.nameAr, season: input.season },
            }
          : null;
      }
      case "NATIONALITY": {
        const c = await gpResolveCountry(input.countryName);
        return c
          ? { q: { template: "NATIONALITY", countryName: c.name }, params: { countryName: c.nameAr } }
          : null;
      }
      case "NATIONAL_TEAM": {
        const c = await gpResolveCountry(input.countryName);
        return c
          ? {
              q: { template: "NATIONAL_TEAM", countryName: c.name },
              params: { countryName: c.nameAr },
            }
          : null;
      }
      case "COMPETITION_EVER": {
        const comp = await gpResolveCompetition(input.leagueId);
        return comp
          ? {
              q: {
                template: "COMPETITION_EVER",
                leagueId: comp.leagueId,
                altLeagueIds: comp.altLeagueIds,
              },
              params: { competitionName: comp.nameAr },
            }
          : null;
      }
      case "COMPETITION_SEASON": {
        const comp = await gpResolveCompetition(input.leagueId);
        return comp
          ? {
              q: {
                template: "COMPETITION_SEASON",
                leagueId: comp.leagueId,
                altLeagueIds: comp.altLeagueIds,
                season: input.season,
              },
              params: { competitionName: comp.nameAr, season: input.season },
            }
          : null;
      }
      case "TROPHY_EVER": {
        const t = await gpResolveTrophy(input.compName, input.country);
        return t
          ? {
              q: { template: "TROPHY_EVER", trophy: t },
              params: { trophyName: t.nameAr },
            }
          : null;
      }
      case "TROPHY_SEASON": {
        const t = await gpResolveTrophy(input.compName, input.country);
        return t
          ? {
              q: { template: "TROPHY_SEASON", trophy: t, season: input.season },
              params: { trophyName: t.nameAr, season: input.season },
            }
          : null;
      }
      case "TROPHY_WITH_CLUB": {
        const [t, club] = await Promise.all([
          gpResolveTrophy(input.compName, input.country),
          gpResolveClub(input.clubId),
        ]);
        return t && club
          ? {
              q: { template: "TROPHY_WITH_CLUB", trophy: t, clubId: club.id },
              params: { trophyName: t.nameAr, clubName: club.nameAr },
            }
          : null;
      }
    }
  }

  async resolvePlayer(playerId: string) {
    return gpResolvePlayer(playerId);
  }
}
