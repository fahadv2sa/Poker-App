-- Sample size behind avg_rating (number of rated season/competition lines).
-- Additive, NOT NULL DEFAULT 0 — instant on PG 18 (default stored as metadata).
ALTER TABLE "football"."players" ADD COLUMN "avg_rating_n" INTEGER NOT NULL DEFAULT 0;
