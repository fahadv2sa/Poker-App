-- Top Ten variety SCOPE: competition × club × time.
-- Additive: `scope` (COMP | TOP5 | CLUB_LEAGUE | CLUB_UCL | CLUB_ALL) defaults to the
-- prior single-competition behaviour; `club_key` is the club for the CLUB_* scopes.
ALTER TABLE "top_10"."tt_catalog_entry" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'COMP';
ALTER TABLE "top_10"."tt_catalog_entry" ADD COLUMN IF NOT EXISTS "club_key" TEXT;

-- The uniqueness of an admitted list now includes its scope + club (same competition +
-- season window can exist as a competition-wide list AND a club-scoped list).
DROP INDEX IF EXISTS "top_10"."tt_catalog_entry_type_league_id_season_season_end_built_at_key";
CREATE UNIQUE INDEX IF NOT EXISTS "tt_catalog_entry_type_scope_club_key_league_id_season_season_end_built_at_key"
  ON "top_10"."tt_catalog_entry" ("type", "scope", "club_key", "league_id", "season", "season_end", "built_at");
