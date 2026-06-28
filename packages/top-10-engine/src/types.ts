/**
 * Top Ten engine — domain types. Pure data shapes only; the engine never touches
 * I/O or the DB. The game-server feeds it plain objects (built from the frozen
 * catalog + live events) and persists the results.
 */
import type { TtDifficulty, TtQuestionType } from "@fb/shared";

/** One row of the correct answer list. `rank` 1 (top) .. 10. */
export interface RankedPlayer {
  rank: number;
  playerId: string; // football.players.id (opaque uuid)
  value: number; // the stat value
  fame: number; // fame_score at build time
  name: string;
  nameAr: string;
}

/** A built, admitted Top-Ten list for one (type, competition, season). */
export interface TopTenList {
  type: TtQuestionType;
  leagueId: number;
  season: number;
  difficulty: TtDifficulty;
  fameSum: number;
  players: RankedPlayer[]; // exactly 10, ranked 1..10
}

/** A per-player aggregated candidate the gate + ranking operate on (already SUM'd
 *  over multi-row transfer lines for one comp/season). `value` null = the stat is
 *  not recorded for this player that season. */
export interface CandidateRow {
  playerId: string;
  value: number | null;
  appearances: number;
  fame: number;
  name: string;
  nameAr: string;
}
