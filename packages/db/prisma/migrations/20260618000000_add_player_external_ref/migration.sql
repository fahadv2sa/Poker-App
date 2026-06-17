-- AlterTable
ALTER TABLE "players" ADD COLUMN     "external_ref" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "players_external_ref_key" ON "players"("external_ref");
