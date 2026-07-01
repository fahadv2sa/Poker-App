-- Additive reserve/"B" team flag on clubs (e.g. "Barcelona B", "Real Madrid Castilla").
-- DEFAULT false → safe to apply while the currently-deployed code is still live (old
-- code simply ignores the new column). Consumed only by the Top Ten hint generator.
ALTER TABLE "football"."clubs" ADD COLUMN "is_reserve" BOOLEAN NOT NULL DEFAULT false;
