-- Average API-Football match rating per player (display/data only; never read by
-- the rank engine). Additive + nullable, so existing rows stay valid.
ALTER TABLE "football"."players" ADD COLUMN "avg_rating" DOUBLE PRECISION;
