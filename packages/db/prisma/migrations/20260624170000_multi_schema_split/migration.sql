-- Multi-game schema split: move identity(A)->platform, football(B)->football, Link Up(C+D)->link_up
CREATE SCHEMA IF NOT EXISTS "platform";
CREATE SCHEMA IF NOT EXISTS "football";
CREATE SCHEMA IF NOT EXISTS "link_up";

-- enum types
ALTER TYPE public.friend_status SET SCHEMA "platform";
ALTER TYPE public.position_code SET SCHEMA "football";
ALTER TYPE public.club_kind SET SCHEMA "football";
ALTER TYPE public.tournament_type SET SCHEMA "football";
ALTER TYPE public.wallet_tx_type SET SCHEMA "link_up";
ALTER TYPE public.game_status SET SCHEMA "link_up";
ALTER TYPE public.game_kind SET SCHEMA "link_up";
ALTER TYPE public.game_phase SET SCHEMA "link_up";
ALTER TYPE public.game_player_status SET SCHEMA "link_up";
ALTER TYPE public.card_type SET SCHEMA "link_up";
ALTER TYPE public.bet_round SET SCHEMA "link_up";
ALTER TYPE public.bet_action SET SCHEMA "link_up";
ALTER TYPE public.result_outcome SET SCHEMA "link_up";
ALTER TYPE public.difficulty SET SCHEMA "link_up";
ALTER TYPE public.play_event_type SET SCHEMA "link_up";

-- tables (owned identity/serial sequences move with the table)
ALTER TABLE public.users SET SCHEMA "platform";
ALTER TABLE public.email_otps SET SCHEMA "platform";
ALTER TABLE public.likes SET SCHEMA "platform";
ALTER TABLE public.friendships SET SCHEMA "platform";
ALTER TABLE public.user_avatars SET SCHEMA "platform";
ALTER TABLE public.nationalities SET SCHEMA "football";
ALTER TABLE public.positions SET SCHEMA "football";
ALTER TABLE public.clubs SET SCHEMA "football";
ALTER TABLE public.players SET SCHEMA "football";
ALTER TABLE public.player_tournament_stats SET SCHEMA "football";
ALTER TABLE public.player_season_stats SET SCHEMA "football";
ALTER TABLE public.player_clubs SET SCHEMA "football";
ALTER TABLE public.player_national_teams SET SCHEMA "football";
ALTER TABLE public.player_youth_clubs SET SCHEMA "football";
ALTER TABLE public.wallets SET SCHEMA "link_up";
ALTER TABLE public.wallet_transactions SET SCHEMA "link_up";
ALTER TABLE public.bank_claims SET SCHEMA "link_up";
ALTER TABLE public.user_stats SET SCHEMA "link_up";
ALTER TABLE public.play_events SET SCHEMA "link_up";
ALTER TABLE public.player_metrics SET SCHEMA "link_up";
ALTER TABLE public.badges SET SCHEMA "link_up";
ALTER TABLE public.player_badges SET SCHEMA "link_up";
ALTER TABLE public.hand_ranks SET SCHEMA "link_up";
ALTER TABLE public.games SET SCHEMA "link_up";
ALTER TABLE public.game_players SET SCHEMA "link_up";
ALTER TABLE public.game_cards SET SCHEMA "link_up";
ALTER TABLE public.bets SET SCHEMA "link_up";
ALTER TABLE public.player_hand_claims SET SCHEMA "link_up";
ALTER TABLE public.game_results SET SCHEMA "link_up";

-- drop stale one-off backup table (the real backup is the prod dump)
DROP TABLE IF EXISTS public.player_clubs_backup;
