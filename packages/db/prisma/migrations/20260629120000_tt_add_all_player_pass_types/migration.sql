-- Top Ten: add ALL-PLAYERS variants of the two pass metrics (key passes / accurate
-- passes), alongside the existing midfielder-only versions. Additive enum values only.
ALTER TYPE "top_10"."tt_question_type" ADD VALUE IF NOT EXISTS 'KEY_PASSES_ALL';
ALTER TYPE "top_10"."tt_question_type" ADD VALUE IF NOT EXISTS 'ACCURATE_PASSES_ALL';
