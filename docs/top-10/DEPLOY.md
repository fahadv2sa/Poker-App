# Top Ten — production go-live runbook (migrate-first)

Top Ten shares the platform Postgres (schemas `football`, `link_up`, `platform`, `top_10`).
Everything below touches **only the `top_10` schema** (additive) and **reads** `football.*`
read-only. Follow the order exactly — **migrate the DB first, deploy code second** (the
non-negotiable rule in `apps/web/CLAUDE.md`).

> **`photoUrl` needs NO migration.** The revealed-card photo is read at runtime from the
> existing `football.players.photo_url` column and added to the socket payload in code
> (`CatalogPlayer.photoUrl` + `match.ts`). No schema change for it.

> **Credential hygiene:** the production DB connection string pasted in chat should be
> **rotated** after this run (it has been exposed). Set it as an env var, don't paste inline.

## 0. Prep
```bash
# from the repo root. Use the PRODUCTION connection string (Railway). Quote it.
export TT_PROD_URL='postgresql://USER:PASS@HOST:PORT/railway'
export NODE_OPTIONS=--use-system-ca          # corporate TLS interception
cd packages/db
```
Backup is advisable but not required for safety: every step here is additive (ALTER TYPE
ADD VALUE / ADD COLUMN) or non-destructive (the catalog build inserts a NEW generation and
flips the prior one `active=false`; it never deletes football data). To snapshot anyway:
`pg_dump "$TT_PROD_URL" --schema=top_10 -f top10_backup.sql`.

## 1. Apply the migrations (in order, idempotent)
```bash
DATABASE_URL="$TT_PROD_URL" DIRECT_URL="$TT_PROD_URL" npx prisma migrate deploy
```
This applies any pending Top Ten migrations, in order:
`20260629130000_tt_new_stat_types` → `20260629130001_tt_season_window` →
`20260629160000_tt_scope_club` (plus the catalog tables if not present). Verify:
```bash
DATABASE_URL="$TT_PROD_URL" DIRECT_URL="$TT_PROD_URL" npx prisma migrate status   # → "up to date"
```

## 2. Build the catalog against prod (reads prod football, writes prod top_10)
```bash
DATABASE_URL="$TT_PROD_URL" DIRECT_URL="$TT_PROD_URL" npx tsx prisma/build-top10-catalog.ts
```
Build **aborts** if any generated list is unsafe. The entry count depends on prod football
data completeness (locally it is 1913 — EASY/MED/HARD ≈ even thirds). Note the count it prints.

## 3. Audit the prod catalog (must be 0 / 0)
```bash
DATABASE_URL="$TT_PROD_URL" DIRECT_URL="$TT_PROD_URL" npx tsx prisma/audit-top10-catalog.ts
# → "Entries with ≥1 violation: 0", "Entries drifted from data: 0", "✅ PASS"
```
If this is not 0/0, **stop** — do not deploy the server until it is.

## 4. Deploy the server + web (Railway auto-deploys on push to the deploy branch)
Only AFTER 1–3 are green. The Top Ten Railway services run `prisma migrate deploy` in their
predeploy too (belt-and-suspenders), but step 1 above guarantees order.

## 5. Health check
```bash
curl -s https://<top10-game-server-host>/health     # → {"ok":true,"questions":<count from step 2>}
```
Then do a real smoke: log in on the deployed web, start a Quick Play match, confirm bots
fill, a reveal happens, hint mode shows its rank, and the match ends with standings/XP.

## Rollback
- Migrations are additive → no rollback needed (old code ignores the new columns/enums).
- Catalog: re-running step 2 supersedes the active generation; the prior generation rows
  remain (`active=false`) and can be re-activated by flipping the flag if ever needed.
