-- Friend requests: turn the symmetric auto-accept friendship into a directional
-- request with an approval state machine (PENDING/ACCEPTED/REJECTED). Existing
-- rows were active friendships → backfill them as ACCEPTED so nothing breaks.

CREATE TYPE "friend_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- Repoint the FKs/columns from userA/userB to requester/addressee.
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_user_a_id_fkey";
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_user_b_id_fkey";
DROP INDEX "friendships_user_a_id_idx";
DROP INDEX "friendships_user_b_id_idx";
ALTER INDEX "friendships_user_a_id_user_b_id_key" RENAME TO "friendships_requester_id_addressee_id_key";

ALTER TABLE "friendships" RENAME COLUMN "user_a_id" TO "requester_id";
ALTER TABLE "friendships" RENAME COLUMN "user_b_id" TO "addressee_id";
ALTER TABLE "friendships" ADD COLUMN "status" "friend_status" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "friendships" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Pre-existing pairs were already accepted friendships.
UPDATE "friendships" SET "status" = 'ACCEPTED';

CREATE INDEX "friendships_addressee_id_status_idx" ON "friendships"("addressee_id", "status");
CREATE INDEX "friendships_requester_id_status_idx" ON "friendships"("requester_id", "status");
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
