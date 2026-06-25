-- CreateEnum
CREATE TYPE "platform"."admin_role" AS ENUM ('SUPER_ADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "platform"."admin_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- NOTE: Prisma's diff also proposed 4 unrelated `ALTER TABLE ... ALTER COLUMN
-- "updated_at" DROP DEFAULT` statements (player_season_stats, player_metrics,
-- friendships, user_avatars). Those are PRE-EXISTING schema/DB drift, not part of
-- the admin feature, so they were intentionally removed here to keep this
-- migration purely additive. The drift is documented for separate, deliberate
-- handling — never bundled into an unrelated (prod-bound) migration.

-- CreateTable
CREATE TABLE "platform"."admins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "platform"."admin_role" NOT NULL,
    "status" "platform"."admin_status" NOT NULL DEFAULT 'ACTIVE',
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."admin_permissions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'platform',
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."admin_audit_log" (
    "seq" BIGSERIAL NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "scope" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_user_id_key" ON "platform"."admins"("user_id");

-- CreateIndex
CREATE INDEX "admins_role_idx" ON "platform"."admins"("role");

-- CreateIndex
CREATE INDEX "admin_permissions_admin_id_idx" ON "platform"."admin_permissions"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permissions_admin_id_permission_key_scope_key" ON "platform"."admin_permissions"("admin_id", "permission_key", "scope");

-- CreateIndex
CREATE INDEX "admin_audit_log_actor_user_id_created_at_idx" ON "platform"."admin_audit_log"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_target_type_target_id_idx" ON "platform"."admin_audit_log"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "platform"."admins" ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."admin_permissions" ADD CONSTRAINT "admin_permissions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "platform"."admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
