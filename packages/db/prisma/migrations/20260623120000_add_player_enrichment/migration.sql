-- Additive only: static per-player columns + a fully-columnized season/competition
-- stats table. Safe to apply alongside existing data (no drops, no rewrites).

-- AlterTable: static per-player data from API-Football (display/data only).
ALTER TABLE "players" ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "birth_place" TEXT,
ADD COLUMN     "birth_country" TEXT,
ADD COLUMN     "height_cm" INTEGER,
ADD COLUMN     "weight_kg" INTEGER;

-- CreateTable: one row per (player, season, competition, team), every API stat
-- field flattened into its own column.
CREATE TABLE "player_season_stats" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "team_id" INTEGER,
    "team_name" TEXT,
    "team_logo" TEXT,
    "league_id" INTEGER,
    "league_name" TEXT,
    "league_country" TEXT,
    "league_logo" TEXT,
    "league_flag" TEXT,
    "games_appearances" INTEGER,
    "games_lineups" INTEGER,
    "games_minutes" INTEGER,
    "games_number" INTEGER,
    "games_position" TEXT,
    "games_rating" DOUBLE PRECISION,
    "games_captain" BOOLEAN,
    "subs_in" INTEGER,
    "subs_out" INTEGER,
    "subs_bench" INTEGER,
    "shots_total" INTEGER,
    "shots_on" INTEGER,
    "goals_total" INTEGER,
    "goals_conceded" INTEGER,
    "goals_assists" INTEGER,
    "goals_saves" INTEGER,
    "passes_total" INTEGER,
    "passes_key" INTEGER,
    "passes_accuracy" INTEGER,
    "tackles_total" INTEGER,
    "tackles_blocks" INTEGER,
    "tackles_interceptions" INTEGER,
    "duels_total" INTEGER,
    "duels_won" INTEGER,
    "dribbles_attempts" INTEGER,
    "dribbles_success" INTEGER,
    "dribbles_past" INTEGER,
    "fouls_drawn" INTEGER,
    "fouls_committed" INTEGER,
    "cards_yellow" INTEGER,
    "cards_yellowred" INTEGER,
    "cards_red" INTEGER,
    "penalty_won" INTEGER,
    "penalty_committed" INTEGER,
    "penalty_scored" INTEGER,
    "penalty_missed" INTEGER,
    "penalty_saved" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_season_stats_pkey" PRIMARY KEY ("id")
);

-- Indexes + uniqueness (one stat line per player/season/competition/team).
CREATE INDEX "player_season_stats_player_id_idx" ON "player_season_stats"("player_id");
CREATE INDEX "player_season_stats_season_idx" ON "player_season_stats"("season");
CREATE INDEX "player_season_stats_league_id_idx" ON "player_season_stats"("league_id");
CREATE UNIQUE INDEX "player_season_stats_player_id_season_league_id_team_id_key" ON "player_season_stats"("player_id", "season", "league_id", "team_id");

-- FK to players (cascade on delete, mirrors the other player_* link tables).
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
