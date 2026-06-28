-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "top_10";

-- CreateEnum
CREATE TYPE "top_10"."tt_question_type" AS ENUM ('GOAL_SCORERS', 'ASSISTS', 'KEY_PASSES', 'TACKLES', 'ACCURATE_PASSES', 'GK_CLEAN_SHEETS');

-- CreateEnum
CREATE TYPE "top_10"."tt_difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "top_10"."tt_match_kind" AS ENUM ('MANUAL', 'QUICK_PLAY');

-- CreateEnum
CREATE TYPE "top_10"."tt_match_status" AS ENUM ('LOBBY', 'IN_PROGRESS', 'ENDED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "top_10"."tt_match_player_status" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "top_10"."tt_round_mode" AS ENUM ('NORMAL', 'HINT');

-- CreateEnum
CREATE TYPE "top_10"."tt_round_status" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "top_10"."tt_round_end_reason" AS ENUM ('ALL_REVEALED', 'UNANIMOUS_END', 'TIMER', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "top_10"."tt_catalog_entry" (
    "id" UUID NOT NULL,
    "type" "top_10"."tt_question_type" NOT NULL,
    "league_id" INTEGER NOT NULL,
    "competition_name" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "difficulty" "top_10"."tt_difficulty" NOT NULL,
    "fame_sum" DOUBLE PRECISION NOT NULL,
    "built_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tt_catalog_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_catalog_player" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "football_player_id" UUID NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "fame_at_build" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "tt_catalog_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_difficulty_config" (
    "id" UUID NOT NULL,
    "easy_min_sum" DOUBLE PRECISION NOT NULL,
    "hard_max_sum" DOUBLE PRECISION NOT NULL,
    "entries_count" INTEGER NOT NULL,
    "built_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tt_difficulty_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_matches" (
    "id" UUID NOT NULL,
    "kind" "top_10"."tt_match_kind" NOT NULL DEFAULT 'MANUAL',
    "difficulty" "top_10"."tt_difficulty" NOT NULL DEFAULT 'MEDIUM',
    "round_timer_sec" INTEGER NOT NULL DEFAULT 600,
    "rounds_total" INTEGER NOT NULL DEFAULT 3,
    "max_players" INTEGER NOT NULL DEFAULT 4,
    "status" "top_10"."tt_match_status" NOT NULL DEFAULT 'LOBBY',
    "invite_code" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "tt_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_match_players" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "status" "top_10"."tt_match_player_status" NOT NULL DEFAULT 'ACTIVE',
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "withdrawn_at" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tt_match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_rounds" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "round_no" INTEGER NOT NULL,
    "catalog_entry_id" UUID,
    "mode" "top_10"."tt_round_mode" NOT NULL DEFAULT 'NORMAL',
    "status" "top_10"."tt_round_status" NOT NULL DEFAULT 'ACTIVE',
    "no_correct_rotations" INTEGER NOT NULL DEFAULT 0,
    "end_reason" "top_10"."tt_round_end_reason",
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "tt_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_round_reveals" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "revealed_by_user_id" UUID,
    "points" INTEGER NOT NULL,
    "football_player_id" UUID NOT NULL,
    "revealed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tt_round_reveals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_progression" (
    "user_id" UUID NOT NULL,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "celebrated_level" INTEGER NOT NULL DEFAULT 1,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "matches_won" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tt_progression_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "top_10"."tt_xp_events" (
    "seq" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "match_id" UUID,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tt_xp_events_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "tt_catalog_entry_active_difficulty_idx" ON "top_10"."tt_catalog_entry"("active", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "tt_catalog_entry_type_league_id_season_built_at_key" ON "top_10"."tt_catalog_entry"("type", "league_id", "season", "built_at");

-- CreateIndex
CREATE INDEX "tt_catalog_player_entry_id_idx" ON "top_10"."tt_catalog_player"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "tt_catalog_player_entry_id_rank_key" ON "top_10"."tt_catalog_player"("entry_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "tt_matches_invite_code_key" ON "top_10"."tt_matches"("invite_code");

-- CreateIndex
CREATE INDEX "tt_matches_status_ended_at_idx" ON "top_10"."tt_matches"("status", "ended_at");

-- CreateIndex
CREATE UNIQUE INDEX "tt_match_players_match_id_seat_key" ON "top_10"."tt_match_players"("match_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "tt_match_players_match_id_user_id_key" ON "top_10"."tt_match_players"("match_id", "user_id");

-- CreateIndex
CREATE INDEX "tt_rounds_match_id_idx" ON "top_10"."tt_rounds"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "tt_rounds_match_id_round_no_key" ON "top_10"."tt_rounds"("match_id", "round_no");

-- CreateIndex
CREATE INDEX "tt_round_reveals_round_id_idx" ON "top_10"."tt_round_reveals"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "tt_round_reveals_round_id_rank_key" ON "top_10"."tt_round_reveals"("round_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "tt_xp_events_reference_key" ON "top_10"."tt_xp_events"("reference");

-- CreateIndex
CREATE INDEX "tt_xp_events_user_id_created_at_idx" ON "top_10"."tt_xp_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "players_name_idx" ON "football"."players"("name");

-- CreateIndex
CREATE INDEX "players_name_ar_idx" ON "football"."players"("name_ar");

-- AddForeignKey
ALTER TABLE "top_10"."tt_catalog_player" ADD CONSTRAINT "tt_catalog_player_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "top_10"."tt_catalog_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_10"."tt_match_players" ADD CONSTRAINT "tt_match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "top_10"."tt_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_10"."tt_rounds" ADD CONSTRAINT "tt_rounds_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "top_10"."tt_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_10"."tt_round_reveals" ADD CONSTRAINT "tt_round_reveals_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "top_10"."tt_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
