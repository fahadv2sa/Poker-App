-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "guess_player";

-- CreateEnum
CREATE TYPE "guess_player"."gp_mode" AS ENUM ('VS_SYSTEM', 'VS_HUMANS');

-- CreateEnum
CREATE TYPE "guess_player"."gp_match_kind" AS ENUM ('MANUAL', 'QUICK_PLAY');

-- CreateEnum
CREATE TYPE "guess_player"."gp_match_status" AS ENUM ('LOBBY', 'IN_PROGRESS', 'ENDED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "guess_player"."gp_difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "guess_player"."gp_match_player_status" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "guess_player"."gp_round_status" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "guess_player"."gp_round_end_reason" AS ENUM ('CORRECT_GUESS', 'TIMER', 'ABANDONED');

-- CreateEnum
CREATE TYPE "guess_player"."gp_question_template" AS ENUM ('CLUB_EVER', 'CLUB_SEASON', 'NATIONALITY', 'NATIONAL_TEAM', 'COMPETITION_EVER', 'COMPETITION_SEASON', 'TROPHY_EVER', 'TROPHY_SEASON', 'TROPHY_WITH_CLUB');

-- CreateEnum
CREATE TYPE "guess_player"."gp_answer_value" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- AlterTable
ALTER TABLE "football"."nationalities" ADD COLUMN     "name_ar" TEXT,
ADD COLUMN     "name_ar_verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "football"."clubs" ADD COLUMN     "name_ar" TEXT,
ADD COLUMN     "name_ar_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "football"."competition_names_ar" (
    "league_id" INTEGER NOT NULL,
    "name_ar" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "competition_names_ar_pkey" PRIMARY KEY ("league_id")
);

-- CreateTable
CREATE TABLE "football"."competition_aliases" (
    "league_id" INTEGER NOT NULL,
    "canonical_league_id" INTEGER NOT NULL,

    CONSTRAINT "competition_aliases_pkey" PRIMARY KEY ("league_id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_askable_trophies" (
    "id" UUID NOT NULL,
    "comp_name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "name_ar" TEXT,
    "name_ar_verified" BOOLEAN NOT NULL DEFAULT false,
    "merged_into_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "seeded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gp_askable_trophies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_matches" (
    "id" UUID NOT NULL,
    "kind" "guess_player"."gp_match_kind" NOT NULL DEFAULT 'MANUAL',
    "mode" "guess_player"."gp_mode" NOT NULL DEFAULT 'VS_SYSTEM',
    "difficulty" "guess_player"."gp_difficulty",
    "rounds_total" INTEGER NOT NULL DEFAULT 3,
    "round_timer_sec" INTEGER NOT NULL DEFAULT 600,
    "turn_timer_sec" INTEGER NOT NULL DEFAULT 30,
    "max_players" INTEGER NOT NULL DEFAULT 4,
    "status" "guess_player"."gp_match_status" NOT NULL DEFAULT 'LOBBY',
    "invite_code" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "room_name" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "gp_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_match_players" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "status" "guess_player"."gp_match_player_status" NOT NULL DEFAULT 'ACTIVE',
    "withdrawn_at" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gp_match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_rounds" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "round_no" INTEGER NOT NULL,
    "hidden_player_id" UUID NOT NULL,
    "picker_user_id" UUID,
    "status" "guess_player"."gp_round_status" NOT NULL DEFAULT 'ACTIVE',
    "end_reason" "guess_player"."gp_round_end_reason",
    "winner_user_id" UUID,
    "winner_points" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "gp_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_questions" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "turn_no" INTEGER NOT NULL,
    "asker_user_id" UUID NOT NULL,
    "template" "guess_player"."gp_question_template" NOT NULL,
    "params" JSONB NOT NULL,
    "answer" "guess_player"."gp_answer_value" NOT NULL,
    "asked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gp_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_guesses" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "guesser_user_id" UUID NOT NULL,
    "football_player_id" UUID NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "guessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gp_guesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_progression" (
    "user_id" UUID NOT NULL,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "celebrated_level" INTEGER NOT NULL DEFAULT 1,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "matches_won" INTEGER NOT NULL DEFAULT 0,
    "rounds_won" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gp_progression_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "guess_player"."gp_xp_events" (
    "seq" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "match_id" UUID,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gp_xp_events_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "gp_askable_trophies_active_sort_order_idx" ON "guess_player"."gp_askable_trophies"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "gp_askable_trophies_comp_name_country_key" ON "guess_player"."gp_askable_trophies"("comp_name", "country");

-- CreateIndex
CREATE UNIQUE INDEX "gp_matches_invite_code_key" ON "guess_player"."gp_matches"("invite_code");

-- CreateIndex
CREATE INDEX "gp_matches_status_ended_at_idx" ON "guess_player"."gp_matches"("status", "ended_at");

-- CreateIndex
CREATE UNIQUE INDEX "gp_match_players_match_id_seat_key" ON "guess_player"."gp_match_players"("match_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "gp_match_players_match_id_user_id_key" ON "guess_player"."gp_match_players"("match_id", "user_id");

-- CreateIndex
CREATE INDEX "gp_rounds_match_id_idx" ON "guess_player"."gp_rounds"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "gp_rounds_match_id_round_no_key" ON "guess_player"."gp_rounds"("match_id", "round_no");

-- CreateIndex
CREATE INDEX "gp_questions_round_id_turn_no_idx" ON "guess_player"."gp_questions"("round_id", "turn_no");

-- CreateIndex
CREATE INDEX "gp_guesses_round_id_idx" ON "guess_player"."gp_guesses"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "gp_xp_events_reference_key" ON "guess_player"."gp_xp_events"("reference");

-- CreateIndex
CREATE INDEX "gp_xp_events_user_id_created_at_idx" ON "guess_player"."gp_xp_events"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "guess_player"."gp_match_players" ADD CONSTRAINT "gp_match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "guess_player"."gp_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guess_player"."gp_rounds" ADD CONSTRAINT "gp_rounds_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "guess_player"."gp_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guess_player"."gp_questions" ADD CONSTRAINT "gp_questions_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "guess_player"."gp_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guess_player"."gp_guesses" ADD CONSTRAINT "gp_guesses_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "guess_player"."gp_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
