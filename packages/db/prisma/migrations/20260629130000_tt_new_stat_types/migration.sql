-- Top Ten: four new player-per-(competition, season) stat types. Additive enum values.
ALTER TYPE "top_10"."tt_question_type" ADD VALUE IF NOT EXISTS 'SHOTS_TOTAL';
ALTER TYPE "top_10"."tt_question_type" ADD VALUE IF NOT EXISTS 'SHOTS_ON';
ALTER TYPE "top_10"."tt_question_type" ADD VALUE IF NOT EXISTS 'DRIBBLES_SUCCESS';
ALTER TYPE "top_10"."tt_question_type" ADD VALUE IF NOT EXISTS 'GK_SAVES';
