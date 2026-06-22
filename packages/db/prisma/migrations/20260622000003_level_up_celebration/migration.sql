-- Level-up celebration tracking. Additive + non-destructive.
-- New column defaults to 1; backfill existing rows to the player's CURRENT level
-- so the celebration only fires on future level-ups (no retroactive spam).
ALTER TABLE "player_metrics" ADD COLUMN "celebrated_level" INTEGER NOT NULL DEFAULT 1;
UPDATE "player_metrics" SET "celebrated_level" = "level";
