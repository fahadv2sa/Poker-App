-- Top Ten: allow a CUTOFF TIE at rank 10. Several players may share rank 10 when
-- they are tied on the stat value (each is a valid rank-10 answer), so (entry_id,
-- rank) is no longer unique. A player still appears at most once per entry.
-- Additive + non-destructive: existing rows (one player per rank) satisfy the new
-- unique constraint, so no data change is needed.

-- drop the old "one player per rank" unique index
DROP INDEX IF EXISTS "top_10"."tt_catalog_player_entry_id_rank_key";

-- a player appears at most once per entry
CREATE UNIQUE INDEX "tt_catalog_player_entry_id_football_player_id_key"
  ON "top_10"."tt_catalog_player"("entry_id", "football_player_id");

-- keep rank ordering fast (replaces the plain entry_id index)
DROP INDEX IF EXISTS "top_10"."tt_catalog_player_entry_id_idx";
CREATE INDEX "tt_catalog_player_entry_id_rank_idx"
  ON "top_10"."tt_catalog_player"("entry_id", "rank");
