-- AlterTable
ALTER TABLE "football"."player_season_stats" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "link_up"."player_metrics" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform"."friendships" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform"."user_avatars" ALTER COLUMN "updated_at" DROP DEFAULT;
