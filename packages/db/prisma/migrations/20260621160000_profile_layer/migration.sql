-- Profile layer (presentation on top of identity/wallet/metrics). Additive:
-- an editable nickname, an uploaded-avatar table, and two new metric columns
-- (biggest single-hand win/loss) filled by the post-match aggregator.

ALTER TABLE "users" ADD COLUMN "nickname" TEXT;

CREATE TABLE "user_avatars" (
    "user_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_metrics" ADD COLUMN "biggest_win" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "player_metrics" ADD COLUMN "biggest_loss" BIGINT NOT NULL DEFAULT 0;
