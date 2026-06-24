# Deploying Link Up to Railway

Target architecture (one GitHub repo → three Railway services):

```
Railway project
├─ Service "web"          → apps/web         (Next.js)        → poker.fmgtech.dev
├─ Service "game-server"  → apps/game-server (Socket.IO)      → poker-rt.fmgtech.dev
└─ Plugin  "Postgres"     → Railway PostgreSQL
```

The web app is stateless. **The game-server holds authoritative room state in
memory and runs in-process turn timers, so it must be a single always-on
instance (replicas = 1) — never serverless, never scaled horizontally.**

Prerequisites already done in code (Part 1 fixes):
- `schema.prisma` declares `directUrl` (Migrate uses it; runtime uses `url`).
- Root `postinstall` runs `prisma generate` on every install (the Prisma client is
  generated to a git-ignored path, so this must run on each deploy).
- `apps/game-server` starts with `tsx src/index.ts` (the monorepo ships TypeScript
  source; `tsx` is now a runtime dependency).
- `apps/game-server` binds `process.env.PORT` (Railway-injected) with a local fallback.

> **Migrate-first guard (automated).** `railway.toml` sets a `[deploy]`
> `preDeployCommand` that runs `prisma migrate deploy` AFTER build and BEFORE the
> new version serves on every deploy; a failed migration aborts the deploy and the
> old version keeps running. Schema-dependent code can therefore never go live
> ahead of its migration. It applies only pending migrations (idempotent,
> advisory-locked). It needs `DATABASE_URL` in each service's variables and falls
> back to `DATABASE_URL` when `DIRECT_URL` is unset — so a service whose runtime
> only uses `DATABASE_URL` (e.g. game-server) still deploys without a separate
> `DIRECT_URL`. The manual prod-migration commands below remain valid for
> first-time setup and for applying migrations out-of-band before a push.

> Local-dev note: because the schema now declares `directUrl`, add
> `DIRECT_URL` (= your existing `DATABASE_URL`) to your local `packages/db/.env`
> so `pnpm db:migrate` / `db:deploy` keep working. App **runtime** is unaffected
> (Prisma Client reads only `DATABASE_URL`); this matters only for the migrate CLI.

---

## STEP 1 — Push code
First run **`pnpm install`** once at the repo root. Moving `tsx` into the
game-server's `dependencies` (FIX C) changes `pnpm-lock.yaml`, and Railway installs
with a frozen lockfile — so the lockfile must be re-synced and committed, or the
deploy will fail with "lockfile is not up to date". (`pnpm install` also runs the
new root `postinstall` → `prisma generate`; if it errors on a locked engine file,
stop any running local dev servers first.)

Then commit all changes from Part 1 (the four fixes), Part 2 (`railway.toml`, the
two `.env.production.example` files, this `DEPLOY.md`), and the updated
`pnpm-lock.yaml`, and push to the GitHub repo.

## STEP 2 — Create the Railway project
Railway dashboard → **New Project → Deploy from GitHub repo** → select this repo.

## STEP 3 — Add PostgreSQL
In the project → **New → Database → PostgreSQL**. Open the Postgres service →
**Variables/Connect** and copy its connection string. On Railway PG this single
string is used for **both** `DATABASE_URL` and `DIRECT_URL`.

## STEP 4 — Migrate and seed the database
From your local machine, pointing at the Railway connection string (creates the
schema + seeds the 4 Positions and 9 HandRanks):

```bash
DIRECT_URL="<railway-url>" DATABASE_URL="<railway-url>" pnpm db:deploy
DIRECT_URL="<railway-url>" DATABASE_URL="<railway-url>" pnpm db:seed
```

## STEP 5 — Import player data
Your local Docker DB already has the players, scores, and tiers; copy them to
Railway (avoids re-spending API quota). Export the data tables, then restore:

```bash
docker exec football_poker_db pg_dump -U football -d football_poker \
  --data-only --no-owner \
  -t players -t nationalities -t clubs -t player_clubs > data.sql

psql "<Railway connection string>" -f data.sql
```

(Positions and hand_ranks come from STEP 4's seed; `player_tournament_stats` is
intentionally empty until the tournament-stats import is run.)

> **STEP 5b — remap `position_id` (REQUIRED).** `positions` are *seeded* on
> Railway (STEP 4), so their UUIDs differ from your local DB's. The imported
> `players.position_id` values still point at the **local** position UUIDs, and
> the `--data-only` load can leave them dangling (a plain restore would fail the
> FK; `--disable-triggers` would silently keep the bad refs). Either way, every
> `player.position` resolves to `null` and the game crashes with
> *"Field position is required to return data, got `null`"*. `nationalities` and
> `clubs` are imported wholesale so their UUIDs match — only positions need this.
> Fix by remapping via the stable `code`, using the local positions as a lookup:
>
> ```bash
> # 1) load local positions into a lookup table on Railway (real table, not TEMP,
> #    so it survives across the separate psql sessions below)
> psql "<Railway connection string>" \
>   -c "CREATE TABLE positions_local (LIKE positions INCLUDING ALL);"
> docker exec football_poker_db pg_dump -U football -d football_poker \
>   --data-only --no-owner -t positions \
>   | sed 's/public.positions /public.positions_local /g' \
>   | psql "<Railway connection string>"
>
> # 2) repoint players to the seeded positions by code, then drop the lookup
> psql "<Railway connection string>" -c "
>   UPDATE players p SET position_id = pos.id
>   FROM positions_local pl JOIN positions pos ON pos.code = pl.code
>   WHERE p.position_id = pl.id;
>   DROP TABLE positions_local;"
> ```
>
> Verify: `SELECT count(*) FROM players p LEFT JOIN positions pos
> ON p.position_id = pos.id WHERE pos.id IS NULL;` must return **0**.

## STEP 6 — Configure the game-server service
Create/select the **game-server** service (Root Directory = repo root):
- **Build Command:** _(none — `tsx` runs the source; install + postinstall is enough)_
- **Start Command:** `pnpm --filter @fb/game-server start`
- **Replicas:** **1** (required — in-memory room state)
- **Variables:**
  ```
  DATABASE_URL = <Railway PostgreSQL connection string>
  DIRECT_URL   = <same as DATABASE_URL>
  AUTH_SECRET  = <generated 32-byte base64 value>
  WEB_ORIGIN   = https://poker.fmgtech.dev
  ```
  (Do **not** set `PORT` — Railway injects it.)
- **Settings → Networking → Custom Domain:** add `poker-rt.fmgtech.dev` (note the
  CNAME target Railway gives you for STEP 8).

## STEP 7 — Configure the web service
Create/select the **web** service (Root Directory = repo root):
- **Build Command:** `pnpm --filter @fb/web build`
- **Start Command:** `pnpm --filter @fb/web start`
- **Variables:**
  ```
  DATABASE_URL                = <Railway PostgreSQL connection string>
  DIRECT_URL                  = <same as DATABASE_URL>
  AUTH_SECRET                 = <exact same value as the game-server>
  AUTH_URL                    = https://poker.fmgtech.dev
  NEXT_PUBLIC_GAME_SERVER_URL = https://poker-rt.fmgtech.dev
  ```
  (`NEXT_PUBLIC_GAME_SERVER_URL` is baked in at **build** time — it must be set
  before the build runs.)
- **Settings → Networking → Custom Domain:** add `poker.fmgtech.dev` (note the
  CNAME target for STEP 8).

## STEP 8 — Cloudflare DNS
In Cloudflare (DNS for fmgtech.dev), add:

| Name      | Type  | Target (Railway-provided)        | Proxy                |
|-----------|-------|----------------------------------|----------------------|
| `poker`   | CNAME | web service CNAME                | Proxied (orange)     |
| `poker-rt`| CNAME | game-server service CNAME        | **DNS-only (grey)**  |

SSL/TLS mode: **Full (strict)**. `poker-rt` is DNS-only so the browser's WebSocket
connects straight to Railway's TLS endpoint (avoids debugging Cloudflare's WS proxy
on day one; you can switch it to proxied later).

## STEP 9 — Verify end to end
1. Open `https://poker.fmgtech.dev` → **register** → **log in**.
2. **Create a room** → join it from a second browser.
3. **Play a full hand to showdown.**

Troubleshooting:
- Sockets rejected (`UNAUTHENTICATED` / `SESSION_EXPIRED`) → `AUTH_SECRET` is not
  byte-identical on both services.
- Sockets connect but the browser logs a CORS error → `WEB_ORIGIN` on the
  game-server must exactly equal `https://poker.fmgtech.dev`.
- Web build fails on a missing Prisma client → the root `postinstall` didn't run;
  confirm install happens at the repo root.
- Game-server can't be reached → confirm it bound Railway's `PORT` (logs print
  `Game server listening on :<port>`), domain is **DNS-only**, and the start
  command is `pnpm --filter @fb/game-server start`.

---

## Future migration note (scaling beyond Railway)
The code is already provider-agnostic:
- **Move web to Vercel:** set `DATABASE_URL` to the Neon **POOLED** string and
  `DIRECT_URL` to the Neon **DIRECT** string — no code change (`directUrl` is
  already in the schema).
- **Move game-server to Fly.io / a VPS:** no code change — only env vars. The
  `PORT` fallback and `tsx` start command are already host-agnostic.
