-- Level-based daily bank claim — claim-log columns. Additive + non-destructive;
-- existing rows keep NULL (they predate the level-scaled claim).
-- AlterTable
ALTER TABLE "bank_claims" ADD COLUMN     "level" INTEGER;
ALTER TABLE "bank_claims" ADD COLUMN     "balance_after" BIGINT;
