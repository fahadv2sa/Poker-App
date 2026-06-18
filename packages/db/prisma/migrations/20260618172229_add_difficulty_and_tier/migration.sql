-- CreateEnum
CREATE TYPE "difficulty" AS ENUM ('VERY_EASY', 'EASY', 'MEDIUM', 'ELITE');

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "difficulty" "difficulty" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "tier" INTEGER;

-- CreateIndex
CREATE INDEX "players_tier_idx" ON "players"("tier");
