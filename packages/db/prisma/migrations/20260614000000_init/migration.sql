-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "wallet_tx_type" AS ENUM ('SIGNUP_BONUS', 'BANK_CLAIM', 'ANTE', 'BET', 'RAISE', 'ALLIN', 'WIN', 'SPLIT_WIN', 'REFUND', 'FOLD_FORFEIT');

-- CreateEnum
CREATE TYPE "position_code" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "game_status" AS ENUM ('LOBBY', 'IN_PROGRESS', 'ENDED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "game_phase" AS ENUM ('LOBBY', 'PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN', 'RESOLVE', 'ENDED');

-- CreateEnum
CREATE TYPE "game_player_status" AS ENUM ('WAITING', 'ACTIVE', 'FOLDED', 'ALLIN', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "card_type" AS ENUM ('HOLE', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "bet_round" AS ENUM ('PREFLOP', 'FLOP', 'TURN', 'RIVER');

-- CreateEnum
CREATE TYPE "bet_action" AS ENUM ('ANTE', 'CHECK', 'CALL', 'RAISE', 'FOLD', 'ALLIN');

-- CreateEnum
CREATE TYPE "result_outcome" AS ENUM ('WIN', 'SPLIT', 'LOSE', 'FOLD', 'REFUND');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "player_number" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar_seed" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 1000,
    "highest_balance" BIGINT NOT NULL DEFAULT 1000,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" UUID,
    "type" "wallet_tx_type" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_claims" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 1000,
    "claimed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "folds" INTEGER NOT NULL DEFAULT 0,
    "total_coins_won" BIGINT NOT NULL DEFAULT 0,
    "total_coins_lost" BIGINT NOT NULL DEFAULT 0,
    "net_profit_loss" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nationalities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "iso_code" TEXT,
    "flag_emoji" TEXT,

    CONSTRAINT "nationalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "code" "position_code" NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country_id" UUID,
    "logo_url" TEXT,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nationality_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "birth_year" INTEGER,
    "photo_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_clubs" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "from_year" INTEGER,
    "to_year" INTEGER,

    CONSTRAINT "player_clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hand_ranks" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "rule" JSONB NOT NULL,
    "description_ar" TEXT,
    "examples" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hand_ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "room_name" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT,
    "max_players" INTEGER NOT NULL,
    "invite_code" TEXT NOT NULL,
    "status" "game_status" NOT NULL DEFAULT 'LOBBY',
    "created_by" UUID NOT NULL,
    "config" JSONB NOT NULL,
    "phase" "game_phase" NOT NULL DEFAULT 'LOBBY',
    "pot" BIGINT NOT NULL DEFAULT 0,
    "pots" JSONB,
    "current_bet" BIGINT NOT NULL DEFAULT 0,
    "dealer_seat" INTEGER,
    "current_turn_seat" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "status" "game_player_status" NOT NULL DEFAULT 'WAITING',
    "hole_cards" JSONB,
    "committed_total" BIGINT NOT NULL DEFAULT 0,
    "committed_this_round" BIGINT NOT NULL DEFAULT 0,
    "last_bet_amount" BIGINT NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_cards" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "card_type" "card_type" NOT NULL,
    "owner_seat" INTEGER,
    "community_index" INTEGER,
    "football_player_id" UUID NOT NULL,
    "revealed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "game_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "game_player_id" UUID NOT NULL,
    "round" "bet_round" NOT NULL,
    "action" "bet_action" NOT NULL,
    "amount" BIGINT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_hand_claims" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "game_player_id" UUID NOT NULL,
    "claimed_hand_rank_id" UUID,
    "is_valid" BOOLEAN NOT NULL,
    "best_possible_rank_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_hand_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_results" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "game_player_id" UUID NOT NULL,
    "outcome" "result_outcome" NOT NULL,
    "coins_delta" BIGINT NOT NULL,
    "final_balance" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_player_number_key" ON "users"("player_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_reference_key" ON "wallet_transactions"("reference");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bank_claims_user_id_claimed_at_idx" ON "bank_claims"("user_id", "claimed_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_stats_user_id_key" ON "user_stats"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "nationalities_name_key" ON "nationalities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_name_key" ON "clubs"("name");

-- CreateIndex
CREATE INDEX "players_nationality_id_idx" ON "players"("nationality_id");

-- CreateIndex
CREATE INDEX "players_position_id_idx" ON "players"("position_id");

-- CreateIndex
CREATE INDEX "player_clubs_player_id_idx" ON "player_clubs"("player_id");

-- CreateIndex
CREATE INDEX "player_clubs_club_id_idx" ON "player_clubs"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "hand_ranks_code_key" ON "hand_ranks"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hand_ranks_strength_key" ON "hand_ranks"("strength");

-- CreateIndex
CREATE UNIQUE INDEX "games_invite_code_key" ON "games"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_game_id_seat_key" ON "game_players"("game_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_game_id_user_id_key" ON "game_players"("game_id", "user_id");

-- CreateIndex
CREATE INDEX "game_cards_game_id_idx" ON "game_cards"("game_id");

-- CreateIndex
CREATE INDEX "bets_game_id_idx" ON "bets"("game_id");

-- CreateIndex
CREATE INDEX "player_hand_claims_game_id_idx" ON "player_hand_claims"("game_id");

-- CreateIndex
CREATE INDEX "game_results_game_id_idx" ON "game_results"("game_id");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_claims" ADD CONSTRAINT "bank_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "nationalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_nationality_id_fkey" FOREIGN KEY ("nationality_id") REFERENCES "nationalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_clubs" ADD CONSTRAINT "player_clubs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_clubs" ADD CONSTRAINT "player_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_cards" ADD CONSTRAINT "game_cards_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_cards" ADD CONSTRAINT "game_cards_football_player_id_fkey" FOREIGN KEY ("football_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_hand_claims" ADD CONSTRAINT "player_hand_claims_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_hand_claims" ADD CONSTRAINT "player_hand_claims_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_hand_claims" ADD CONSTRAINT "player_hand_claims_claimed_hand_rank_id_fkey" FOREIGN KEY ("claimed_hand_rank_id") REFERENCES "hand_ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_hand_claims" ADD CONSTRAINT "player_hand_claims_best_possible_rank_id_fkey" FOREIGN KEY ("best_possible_rank_id") REFERENCES "hand_ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ----------------------------------------------------------------------------
-- Spec constraints not expressible in the Prisma schema (Section 5 / 6)
-- ----------------------------------------------------------------------------

-- Wallet balance may never go negative (Section 6).
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_nonneg" CHECK ("balance" >= 0);

-- player_number is displayed as e.g. #100001 — start the SERIAL sequence there.
ALTER SEQUENCE "users_player_number_seq" RESTART WITH 100001;
