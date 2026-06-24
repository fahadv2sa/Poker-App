# Runbook — Database backup & restore (`pg_dump`)

**Purpose:** take a safe, verified backup of the database before any **destructive or structural** change,
so nothing irreplaceable is lost. Pre-launch the *test accounts* are disposable — but the **football
reference dataset is NOT** (8,228 players, ~66k club links, fame scores, 99 manually-flagged legends, 46
seeded bots; built from external API-Football imports + multi-step scripts + manual curation). **That** is
what this protects. A full dump captures everything anyway.

## When to run this (golden rule: back up → verify → then proceed)
Before: a destructive migration / `migrate reset`, restructuring schema, **separating Link Up into its own
DB / per-game databases**, tearing down or recreating a Railway service/DB, bulk data edits, or anything
you can't trivially undo. Backups are cheap; the dataset is not.

---

## Prerequisites
- **Docker** (already used for local Postgres) — we run `pg_dump`/`psql`/`pg_restore` from the official
  `postgres` image so there's nothing to install and the tool version matches the server.
- The **prod connection string** = Railway's **public** proxy URL (`*.proxy.rlwy.net`), from the dashboard:
  **Postgres service → Variables → `DATABASE_PUBLIC_URL`** (NOT the in-network `RAILWAY_PRIVATE_DOMAIN`,
  which is unreachable from your machine). It already includes credentials + `sslmode`.
- **Match the major version.** Use a `postgres:<N>` image whose major ≥ the server. Check the server:
  ```bash
  docker run --rm postgres:16 psql "$PROD_URL" -c "show server_version;"
  ```
  If it prints 17.x, use `postgres:17` everywhere below; 16.x → `postgres:16`, etc.

Set the URL once per shell (Git Bash):
```bash
export PROD_URL='postgresql://USER:PASS@HOST.proxy.rlwy.net:PORT/railway?sslmode=require'
```

---

## 1. Sanity counts (know what you're capturing)
```bash
docker run --rm postgres:16 psql "$PROD_URL" -c "select 'players' t, count(*) n from players
  union all select 'clubs', count(*) from clubs
  union all select 'player_clubs', count(*) from player_clubs
  union all select 'players_with_fame', count(*) from players where fame_score is not null
  union all select 'legends', count(*) from players where is_legend
  union all select 'users', count(*) from users;"
```
Note the numbers — you'll re-check them after a restore.

## 2. Full backup (recommended — captures the entire DB)
Custom format (`-Fc`, compressed). Piping stdout → a host file avoids Windows/Docker path issues:
```bash
mkdir -p backups
docker run --rm postgres:16 pg_dump "$PROD_URL" -Fc \
  > "backups/football-b-prod-$(date +%Y%m%d-%H%M).dump"
ls -lh backups/   # confirm the file exists and is NOT 0 bytes
```

## 3. Verify the backup (do NOT skip — an unverified backup isn't a backup)
List the archive's table of contents; a healthy dump shows the tables:
```bash
docker run --rm -i postgres:16 pg_restore -l \
  < "backups/football-b-prod-YYYYMMDD-HHMM.dump" | grep -E 'TABLE DATA (public )?(players|clubs|users)'
```
You should see `players`, `clubs`, `users`, etc. If the file is tiny or this prints nothing, the dump
failed — fix it before doing anything destructive.

## 4. Store it safely
- Dumps go in **`backups/`** (gitignored) or off-repo. **Never commit them** (large + contains data).
- Keep at least the most recent good dump until well after the risky change is confirmed working.

---

## Restore

### Restore into a FRESH / empty database (safest)
Point `TARGET_URL` at the empty DB and load:
```bash
docker run --rm -i postgres:16 pg_restore --no-owner --no-privileges -d "$TARGET_URL" \
  < "backups/football-b-prod-YYYYMMDD-HHMM.dump"
```

### Restore OVER an existing database (drops & recreates objects — destructive on the target)
```bash
docker run --rm -i postgres:16 pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_URL" \
  < "backups/football-b-prod-YYYYMMDD-HHMM.dump"
```
⚠️ `--clean` **drops** objects on `$TARGET_URL` first. Triple-check `$TARGET_URL` points where you intend.

After restoring, re-run the **§1 sanity counts** against the target and confirm they match.

---

## Optional — football-data-only dump (just the irreplaceable tables)
A lighter, focused capture of the reference data (schema + data):
```bash
docker run --rm postgres:16 pg_dump "$PROD_URL" -Fc \
  -t players -t nationalities -t positions -t clubs \
  -t player_clubs -t player_national_teams -t player_youth_clubs \
  -t player_tournament_stats -t player_season_stats -t hand_ranks \
  > "backups/football-data-$(date +%Y%m%d).dump"
```

## Local DB (Docker container `football_poker_db`)
The local Postgres tools live inside the container; dump/restore via `docker exec`:
```bash
# backup local
docker exec football_poker_db pg_dump -U football football_poker -Fc \
  > "backups/local-$(date +%Y%m%d).dump"
# restore local (over existing)
docker exec -i football_poker_db pg_restore --clean --if-exists --no-owner -U football -d football_poker \
  < "backups/local-YYYYMMDD.dump"
```

---

## Gotchas
- **Public vs private URL.** From your machine use the **public** `*.proxy.rlwy.net` string; the
  `*.railway.internal` host only resolves inside Railway's network.
- **`.dump` is binary.** Don't open it in an editor; inspect with `pg_restore -l` (see §3).
- **pg_dump version ≥ server.** An older `pg_dump` refuses a newer server — that's why we pin the image
  tag to the server's major (Prereqs).
- **SSL / corporate TLS.** Railway URLs require SSL (`sslmode=require` in the string). The Docker
  `postgres` image carries its own trust store, isolating this from any corporate TLS interception on
  the host; if you still hit a cert error, run from a network without TLS interception.
- **Never commit dumps** — `/backups/` and `*.dump` are gitignored.
