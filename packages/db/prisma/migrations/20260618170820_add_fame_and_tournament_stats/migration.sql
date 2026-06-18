-- CreateEnum
CREATE TYPE "tournament_type" AS ENUM ('WORLD_CUP', 'EURO_COPA', 'CHAMPIONS_LEAGUE');

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "fame_score" DOUBLE PRECISION,
ADD COLUMN     "top5_league_seasons" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "player_tournament_stats" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "tournament_type" "tournament_type" NOT NULL,
    "appearances" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_tournament_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_tournament_stats_player_id_idx" ON "player_tournament_stats"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_tournament_stats_player_id_tournament_type_key" ON "player_tournament_stats"("player_id", "tournament_type");

-- AddForeignKey
ALTER TABLE "player_tournament_stats" ADD CONSTRAINT "player_tournament_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
