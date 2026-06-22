-- "Add to home screen" one-time reward. Additive + non-destructive.
-- New ledger type for the reward credit (PG 14 allows ADD VALUE in a tx; we only
-- add it here, never use it in this migration).
ALTER TYPE "wallet_tx_type" ADD VALUE IF NOT EXISTS 'INSTALL_REWARD';

-- Per-account claim flag (null = never claimed). Persists across reinstalls so
-- the reward is granted at most once.
ALTER TABLE "users" ADD COLUMN "install_reward_at" TIMESTAMPTZ(6);
