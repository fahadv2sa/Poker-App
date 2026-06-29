-- Top Ten: season WINDOW support. `season_end` is the last season of a cumulative
-- range (equal to `season` for a single-season question). Additive + backfilled.
ALTER TABLE "top_10"."tt_catalog_entry" ADD COLUMN IF NOT EXISTS "season_end" INTEGER;
UPDATE "top_10"."tt_catalog_entry" SET "season_end" = "season" WHERE "season_end" IS NULL;

-- Replace the per-(type,league,season) unique with one that includes the window end,
-- so a single season and the ranges starting at it are distinct rows.
DROP INDEX IF EXISTS "top_10"."tt_catalog_entry_type_league_id_season_built_at_key";
CREATE UNIQUE INDEX IF NOT EXISTS "tt_catalog_entry_type_league_id_season_season_end_built_at_key"
  ON "top_10"."tt_catalog_entry" ("type", "league_id", "season", "season_end", "built_at");
