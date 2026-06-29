# Top Ten — production go-live runbook (migrate-first)

> **STATUS (executed against prod this session):** ✅ Step 1 — all 6 `top_10` migrations
> applied (the schema was previously absent in prod). ✅ Step 2 — catalog built against prod:
> **1919 entries** (EASY 640 / MED 639 / HARD 640). ✅ Step 3 — prod audit **0 violations,
> 0 drift**. **Remaining: step 4 (deploy the server/web code) + step 5 (health check).** The
> DB side is done; nothing reads the catalog yet because the Top Ten services aren't deployed.
> Re-running steps 1–3 is safe/idempotent. **Rotate the exposed DB credential.**

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
This applies all pending Top Ten migrations, in order. Prod had the whole `top_10` schema
pending (6 migrations): `20260627190925_add_top_10_game` (creates the schema + tables +
enums) → `…_tt_catalog_allow_cutoff_ties` → `…_tt_add_all_player_pass_types` →
`…_tt_new_stat_types` → `…_tt_season_window` → `…_tt_scope_club`. Verify:
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
