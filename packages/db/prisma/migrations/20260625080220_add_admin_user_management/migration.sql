-- AlterEnum
ALTER TYPE "link_up"."wallet_tx_type" ADD VALUE 'ADMIN_ADJUST';

-- NOTE: Prisma's diff again re-proposed the 4 unrelated `ALTER COLUMN
-- "updated_at" DROP DEFAULT` drift statements (player_season_stats,
-- player_metrics, friendships, user_avatars — see DEFERRED_FIXES_LOG D1). They
-- were removed again to keep this migration purely additive; the pre-existing
-- drift is tracked for one deliberate fix pass at the end.

-- AlterTable
ALTER TABLE "platform"."users" ADD COLUMN     "disabled_at" TIMESTAMPTZ(6);
