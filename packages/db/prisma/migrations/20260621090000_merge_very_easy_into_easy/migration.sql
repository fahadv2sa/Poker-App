-- Merge VERY_EASY into EASY: difficulty now has three levels (EASY, MEDIUM,
-- ELITE). Postgres can't DROP an enum value, so recreate the type without it
-- and remap any existing VERY_EASY games to EASY first. Display/difficulty
-- only — never touches the rank engine or wallet.
ALTER TYPE "difficulty" RENAME TO "difficulty_old";

CREATE TYPE "difficulty" AS ENUM ('EASY', 'MEDIUM', 'ELITE');

ALTER TABLE "games" ALTER COLUMN "difficulty" DROP DEFAULT;

ALTER TABLE "games"
  ALTER COLUMN "difficulty" TYPE "difficulty"
  USING (
    CASE WHEN "difficulty"::text = 'VERY_EASY' THEN 'EASY'
         ELSE "difficulty"::text
    END
  )::"difficulty";

ALTER TABLE "games" ALTER COLUMN "difficulty" SET DEFAULT 'MEDIUM';

DROP TYPE "difficulty_old";
