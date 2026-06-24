-- Remove the room/table password system (private rooms are now reachable only by
-- invite link or room code). This drops ONLY the games table's room password.
-- It does NOT touch users.password_hash (account login credentials), which is a
-- separate column on a separate table and remains unchanged.
ALTER TABLE "games" DROP COLUMN "password_hash";
