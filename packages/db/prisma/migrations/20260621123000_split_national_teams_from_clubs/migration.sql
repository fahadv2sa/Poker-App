-- Split national teams (and youth teams) out of the club career history.
-- After this, player_clubs holds ONLY real clubs (kind=CLUB); national-team and
-- youth-club appearances move into their own tables, fully preserved. A full
-- snapshot of player_clubs is taken first (player_clubs_backup) so the split is
-- reversible if any entry is misclassified. Data/display only — the rank engine
-- (which reads player_clubs) is untouched.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Entity type discriminator on clubs.
CREATE TYPE "club_kind" AS ENUM ('CLUB', 'NATIONAL_TEAM', 'NATIONAL_YOUTH', 'YOUTH_CLUB');
ALTER TABLE "clubs" ADD COLUMN "kind" "club_kind" NOT NULL DEFAULT 'CLUB';

-- 2) New link tables for the non-club affiliations.
CREATE TABLE "player_national_teams" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    CONSTRAINT "player_national_teams_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "player_youth_clubs" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    CONSTRAINT "player_youth_clubs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "player_national_teams_player_id_club_id_key" ON "player_national_teams"("player_id", "club_id");
CREATE INDEX "player_national_teams_player_id_idx" ON "player_national_teams"("player_id");
CREATE INDEX "player_national_teams_club_id_idx" ON "player_national_teams"("club_id");
CREATE UNIQUE INDEX "player_youth_clubs_player_id_club_id_key" ON "player_youth_clubs"("player_id", "club_id");
CREATE INDEX "player_youth_clubs_player_id_idx" ON "player_youth_clubs"("player_id");
CREATE INDEX "player_youth_clubs_club_id_idx" ON "player_youth_clubs"("club_id");

ALTER TABLE "player_national_teams" ADD CONSTRAINT "player_national_teams_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_national_teams" ADD CONSTRAINT "player_national_teams_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_youth_clubs" ADD CONSTRAINT "player_youth_clubs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_youth_clubs" ADD CONSTRAINT "player_youth_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Classify every club entity by name (clubs vs national/youth). Age-tagged
--    names (U15-U23 / Olympic / Youth) are youth: NATIONAL_YOUTH if the base
--    name is a country, else YOUTH_CLUB. A bare country name = NATIONAL_TEAM.
UPDATE "clubs" c SET "kind" = (
  CASE
    WHEN c."name" ~* '(U-?1[5-9]|U-?2[0-3]|Olympic|Youth)' THEN (
      CASE WHEN EXISTS (
        SELECT 1 FROM "nationalities" n
        WHERE n."name" = trim(regexp_replace(c."name", '\s*(U-?[0-9]{2}.*|Olympic.*|Youth.*)$', '', 'i'))
      ) THEN 'NATIONAL_YOUTH'::"club_kind" ELSE 'YOUTH_CLUB'::"club_kind" END
    )
    WHEN EXISTS (SELECT 1 FROM "nationalities" n WHERE n."name" = c."name") THEN 'NATIONAL_TEAM'::"club_kind"
    ELSE 'CLUB'::"club_kind"
  END
);

-- 4) SNAPSHOT (reversibility): full copy of the original career links.
CREATE TABLE "player_clubs_backup" AS TABLE "player_clubs";

-- 5) Move non-club links into their own tables (DISTINCT guards the unique key).
INSERT INTO "player_national_teams" ("id", "player_id", "club_id")
SELECT gen_random_uuid(), s."player_id", s."club_id" FROM (
  SELECT DISTINCT pc."player_id", pc."club_id"
  FROM "player_clubs" pc JOIN "clubs" c ON c."id" = pc."club_id"
  WHERE c."kind" IN ('NATIONAL_TEAM', 'NATIONAL_YOUTH')
) s;

INSERT INTO "player_youth_clubs" ("id", "player_id", "club_id")
SELECT gen_random_uuid(), s."player_id", s."club_id" FROM (
  SELECT DISTINCT pc."player_id", pc."club_id"
  FROM "player_clubs" pc JOIN "clubs" c ON c."id" = pc."club_id"
  WHERE c."kind" = 'YOUTH_CLUB'
) s;

-- 6) Trim career history to clubs only.
DELETE FROM "player_clubs" pc
USING "clubs" c
WHERE c."id" = pc."club_id" AND c."kind" <> 'CLUB';
