# Football Poker

Server-authoritative online multiplayer card game — Texas-Hold'em structure, but the winning logic is
based on football knowledge (nationality, position, clubs). Fully Arabic, RTL. See `SPEC.md` (authoritative)
and `CLAUDE.md` (quick reference).

> **Status: Phase 1 (Foundation).** Monorepo, full Prisma schema + migration, seeds (Positions + HandRanks),
> auth (register/login/logout), Wallet/UserStats init + 1000 signup bonus, wallet integrity tests,
> docker-compose for PostgreSQL. Phases 2–6 (engine, game server, UI, bank/profile, polish) are not built yet.

## Stack

Next.js 15 (App Router) · Node + Socket.IO (Phase 3) · PostgreSQL + Prisma · Zod · Auth.js (Credentials,
argon2id) · pnpm workspaces + Turborepo.

```
apps/web            Next.js — REST (auth, profile) + UI (Phase 4)
apps/game-server    Socket.IO authoritative server (Phase 3 — placeholder)
packages/db         Prisma schema + migrations + seed + wallet integrity service
packages/engine     Football Hand Engine (Phase 2 — placeholder)
packages/shared     enums, constants, Zod contracts
```

## Prerequisites

- Node ≥ 20 (tested on 24), pnpm ≥ 9
- Docker (for local PostgreSQL) — or any reachable PostgreSQL 14+

## Setup

```bash
pnpm install

# 1) Start PostgreSQL
docker compose up -d

# 2) Environment files
cp .env.example .env                      # used by docker-compose docs / general
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local
#   then set AUTH_SECRET in apps/web/.env.local:  npx auth secret

# 3) Generate the Prisma client, apply the migration, seed game rules
pnpm db:generate
pnpm db:deploy          # applies packages/db/prisma/migrations
pnpm db:seed            # seeds the 4 Positions + 9 HandRanks ONLY

# 4) Run the web app
pnpm --filter @fp/web dev      # http://localhost:3000
```

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `packages/db/.env`, `apps/web/.env.local` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | `packages/db/.env` (optional) | Throwaway DB for the wallet test suite |
| `AUTH_SECRET` | `apps/web/.env.local` | Auth.js JWT/cookie signing secret |
| `AUTH_URL` | `apps/web/.env.local` | Base URL (e.g. `http://localhost:3000`) |

## Tests

Wallet integrity tests hit a real PostgreSQL (row locking + the balance CHECK are database behavior).

```bash
docker compose up -d
pnpm db:deploy           # ensure the target DB is migrated (or TEST_DATABASE_URL)
pnpm --filter @fp/db test
```

Covered: signup bonus init, idempotent references (no double charge), negative-balance prevention,
ledger/balance synchronization, and concurrent debits under row locking.

## Data is data-driven (Section 2, 17)

No football player/club/nationality is hardcoded. Only **game rules** are seeded: the 4 Positions and the
9 HandRanks. The owner supplies the player database later.

- **Add players / clubs / nationalities:** insert rows into `players`, `clubs`, `nationalities`,
  `player_clubs` (via `prisma studio`, SQL, or an admin tool). No code change required.
- **Edit / add an association (HandRank):** edit a row in `hand_ranks`. The `strength` orders ranks; the
  `rule` (jsonb) is the Rule DSL the engine interprets (Phase 2). Reseed with `pnpm db:seed` (idempotent
  upsert by `code`) or edit directly.

### Rule DSL (stored in `hand_ranks.rule`)

```jsonc
{ "type":"group", "attribute":"nationality"|"position"|"club", "min":N, "match":"shared"|"identical" }
//   shared (default): single-valued = same value | club = at least one shared club
//   identical: club only = an exactly-matching full club set
{ "type":"coverage", "attribute":"position", "values":"all" }
{ "type":"anyOf", "rules":[ ... ] }                        // OR
{ "type":"allOf", "disjoint":true|false, "rules":[ ... ] } // AND; disjoint=true ⇒ each rule needs its own cards
```

`HAND_SIZE = 5` (Section 19.1); the `min:5` values in the Royals and Full-House-Club come from this.

## Useful scripts (root)

| Script | Action |
|---|---|
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create/apply a dev migration (needs a live DB) |
| `pnpm db:deploy` | Apply pending migrations |
| `pnpm db:seed` | Seed Positions + HandRanks |
| `pnpm db:reset` | Drop, re-migrate, reseed |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run all test suites |
