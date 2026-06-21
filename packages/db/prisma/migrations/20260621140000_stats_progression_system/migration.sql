-- Statistics & progression system (4 layers): append-only play_events (Layer 1),
-- incremental player_metrics (Layer 2), data-driven badges + player_badges
-- (Layer 3), xp/level on player_metrics (Layer 4). Additive — nothing existing
-- is altered; UserStats stays as-is.

CREATE TYPE "play_event_type" AS ENUM ('BET', 'RAISE', 'CALL', 'CHECK', 'FOLD', 'ALLIN', 'ROUND_SUMMARY');

-- Layer 1 ---------------------------------------------------------------------
CREATE TABLE "play_events" (
    "seq" BIGSERIAL NOT NULL,
    "player_id" UUID NOT NULL,
    "game_id" UUID,
    "hand_number" INTEGER NOT NULL,
    "type" "play_event_type" NOT NULL,
    "value" DOUBLE PRECISION,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "play_events_pkey" PRIMARY KEY ("seq")
);
CREATE INDEX "play_events_player_id_seq_idx" ON "play_events"("player_id", "seq");
CREATE INDEX "play_events_player_id_created_at_idx" ON "play_events"("player_id", "created_at");
CREATE INDEX "play_events_game_id_hand_number_idx" ON "play_events"("game_id", "hand_number");
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Layer 2 / Layer 4 -----------------------------------------------------------
CREATE TABLE "player_metrics" (
    "user_id" UUID NOT NULL,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "folds" INTEGER NOT NULL DEFAULT 0,
    "net_profit" BIGINT NOT NULL DEFAULT 0,
    "total_won" BIGINT NOT NULL DEFAULT 0,
    "total_lost" BIGINT NOT NULL DEFAULT 0,
    "showdown_count" INTEGER NOT NULL DEFAULT 0,
    "bluff_count" INTEGER NOT NULL DEFAULT 0,
    "bluff_success_count" INTEGER NOT NULL DEFAULT 0,
    "weak_won_count" INTEGER NOT NULL DEFAULT 0,
    "bet_to_pot_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bet_action_count" INTEGER NOT NULL DEFAULT 0,
    "luck_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "luck_rounds" INTEGER NOT NULL DEFAULT 0,
    "biggest_pot" BIGINT NOT NULL DEFAULT 0,
    "current_win_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_win_streak" INTEGER NOT NULL DEFAULT 0,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "last_seq" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_metrics_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "player_metrics" ADD CONSTRAINT "player_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Layer 3 ---------------------------------------------------------------------
CREATE TABLE "badges" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "description_ar" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🏅',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rule" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "badges_code_key" ON "badges"("code");

CREATE TABLE "player_badges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_badges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "player_badges_user_id_badge_id_key" ON "player_badges"("user_id", "badge_id");
CREATE INDEX "player_badges_user_id_idx" ON "player_badges"("user_id");
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
