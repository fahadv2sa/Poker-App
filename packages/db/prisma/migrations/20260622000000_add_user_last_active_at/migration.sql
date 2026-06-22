-- Inactivity auto-logout: track each human's last activity timestamp.
-- Additive + non-destructive. DEFAULT now() backfills existing rows to the
-- migration time, so no live session is expired the moment this is applied
-- (the 2-day inactivity window starts counting from here for everyone).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
