-- Email OTP verification (signup). ADDITIVE ONLY — safe to apply while the old
-- code is live (it simply ignores the new columns/table). No drops, no rewrites.
--
-- Grandfather step (last statement): every EXISTING user is stamped verified
-- (email_verified_at = now()) so the handful of legacy/test accounts are NOT
-- forced through the new flow. New signups insert with email_verified_at NULL
-- (unverified) and are gated at login until they enter a valid OTP.

-- AlterTable: email (collected at signup, unique) + the verification flag.
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMPTZ(6);

-- CreateTable: one-time OTP codes. At most ONE active row per user (unique
-- user_id); code stored only as a hash; expires_at <= 5 min; deleted on verify
-- and purged when expired.
CREATE TABLE "email_otps" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_otps_user_id_key" ON "email_otps"("user_id");

-- CreateIndex
CREATE INDEX "email_otps_expires_at_idx" ON "email_otps"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grandfather existing users as verified (no email needed — the gate checks only
-- email_verified_at). New signups stay NULL until they verify.
UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL;
