-- Guess the Player: the continent question («هل هو من قارة …؟») asks which
-- football CONFEDERATION the hidden player's country competes under.
--
-- 1) Curated country → confederation mapping (zero-error reference data;
--    populated by `pnpm --filter @fb/db seed:confederations`, which also
--    audits that every player nationality is covered).
CREATE TABLE "football"."country_confederations" (
    "country_name" TEXT NOT NULL,
    "confederation" TEXT NOT NULL,

    CONSTRAINT "country_confederations_pkey" PRIMARY KEY ("country_name"),
    CONSTRAINT "country_confederations_confederation_check"
        CHECK ("confederation" IN ('UEFA', 'AFC', 'CAF', 'CONMEBOL', 'CONCACAF', 'OFC'))
);

-- 2) The new question template value (persisted questions carry it).
ALTER TYPE "guess_player"."gp_question_template" ADD VALUE IF NOT EXISTS 'CONTINENT';
