-- Guess the Player: split the no-winner round endings for balancing analytics
-- (owner ruling 2026-07-07). Player-facing treatment is identical to TIMER
-- (timeout-style reveal + survival bonus) — this is a data split only:
--   TIMER          = the round clock genuinely expired
--   ALL_EXHAUSTED  = every guesser ran out of attempts → immediate reveal
--   REVEAL_VOTE    = the unanimous «كشف اللاعب» give-up vote passed
ALTER TYPE "guess_player"."gp_round_end_reason" ADD VALUE IF NOT EXISTS 'ALL_EXHAUSTED';
ALTER TYPE "guess_player"."gp_round_end_reason" ADD VALUE IF NOT EXISTS 'REVEAL_VOTE';
