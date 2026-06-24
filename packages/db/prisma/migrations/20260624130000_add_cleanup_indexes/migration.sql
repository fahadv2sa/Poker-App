-- Additive, non-destructive: supporting indexes for the abandoned-room cleanup.
--   * games(status, ended_at): selecting old ABANDONED games efficiently.
--   * wallet_transactions(game_id): makes the SetNull during a game delete
--     index-driven instead of a sequential scan.
-- NOTE: written as plain CREATE INDEX because `prisma migrate deploy` runs the
-- migration in a transaction and PostgreSQL forbids CREATE INDEX CONCURRENTLY
-- inside a transaction. On a large prod table, build these CONCURRENTLY out of
-- band (psql) and `prisma migrate resolve --applied 20260624130000_add_cleanup_indexes`.
CREATE INDEX "games_status_ended_at_idx" ON "games"("status", "ended_at");
CREATE INDEX "wallet_transactions_game_id_idx" ON "wallet_transactions"("game_id");
