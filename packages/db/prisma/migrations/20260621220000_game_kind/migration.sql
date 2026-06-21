-- Room-type flag: distinguishes manually-created rooms (publicly listed,
-- rejoinable while open) from Quick Play matchmaking rooms (never listed, never
-- rejoinable once left). Additive + backfilled, safe to apply while old code runs.
CREATE TYPE "game_kind" AS ENUM ('MANUAL', 'QUICK_PLAY');

ALTER TABLE "games"
  ADD COLUMN "kind" "game_kind" NOT NULL DEFAULT 'MANUAL';

-- Backfill: existing Quick Play rooms were created as private with a generated
-- "لعب سريع — …" name and no password. Reclassify those so they leave the list.
UPDATE "games"
  SET "kind" = 'QUICK_PLAY'
  WHERE "is_private" = true
    AND "password_hash" IS NULL
    AND "room_name" LIKE 'لعب سريع%';
