# Football Poker (فوتبول بوكر)

A server-authoritative online multiplayer card game with a Texas-Hold'em structure, but the
winning logic is based on **football knowledge** — relationships between players by
**nationality, position, and club**. Fully Arabic, RTL, premium dark theme.

Authoritative spec: `SPEC.md`. Quick reference: `CLAUDE.md`.

## Status

All build phases (SPEC §20) are implemented:

- **Foundation** — monorepo, Prisma schema + migration, seed (Positions + HandRanks), Auth.js
  (Credentials, argon2id), Wallet/UserStats + 1000 signup bonus, wallet-integrity tests.
- **Hand Engine** — pure, data-driven interpreter of the 9 association ranks.
- **Game Server** — Socket.IO authoritative state machine, timers, side pots, DB transactions.
- **Frontend** — Next 15 + Tailwind v4 + shadcn/ui + framer-motion premium RTL UI.
- **Bank / Profile / Stats** — bank top-up (2×/24h), profile, statistics + achievements.
- **Polish** — premium table UI, rate limiting, ESLint, fonts via `next/font`.

## Stack

Next.js 15 (App Router) · Node + Socket.IO · PostgreSQL + Prisma · Zod · Auth.js
(Credentials, argon2id) · Tailwind v4 + shadcn/ui + framer-motion · pnpm workspaces + Turborepo.

```
apps/web            Next.js — REST (auth, profile, stats, bank, rooms) + the RTL UI
apps/game-server    Socket.IO authoritative server (engine + timers + room state + DB tx)
packages/db         Prisma schema + migrations + seed + wallet/bank services
packages/engine     Football Hand Engine + betting/pots/fold/resolve (pure, no I/O)
packages/shared     enums, constants, Zod contracts, the 9-rank catalog, rate limiter
```

`packages/engine` is pure functions only. `apps/game-server` owns authoritative in-memory room
state and is the **only referee**: no bet validity, turn, winner, hand evaluation, or balance
change ever happens on the client.

## Prerequisites

- Node ≥ 20 (tested on 24), pnpm ≥ 9
- Docker (for local PostgreSQL) — or any reachable PostgreSQL 14+

> **Corporate / TLS-intercepting networks:** if `pnpm install` fails with
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, your network re-signs HTTPS with a private root CA that is
> in the OS trust store but not Node's. Fix it safely (verification stays ON) with
> `NODE_OPTIONS=--use-system-ca` — e.g. `setx NODE_OPTIONS "--use-system-ca"` (Windows) or
> prefix individual commands. Do **not** disable TLS verification.

## Setup

```bash
pnpm install

# 1) Start PostgreSQL
docker compose up -d

# 2) Environment files (see the table below)
cp packages/db/.env.example       packages/db/.env
cp apps/web/.env.example          apps/web/.env.local
cp apps/game-server/.env.example  apps/game-server/.env.local
#   Generate one AUTH_SECRET and put the SAME value in BOTH
#   apps/web/.env.local and apps/game-server/.env.local:
#     npx auth secret        (or: openssl rand -base64 32)

# 3) Prisma client, migration, seed game rules
pnpm db:generate
pnpm db:deploy          # applies packages/db/prisma/migrations
pnpm db:seed            # seeds the 4 Positions + 9 HandRanks ONLY
```

### Run all three services

The web app and the game server are separate processes; both need the database.

```bash
# terminal 1 — PostgreSQL
docker compose up

# terminal 2 — game server (Socket.IO, default :4000)
pnpm --filter @fp/game-server dev

# terminal 3 — web app (Next.js, :3000)
pnpm --filter @fp/web dev
```

Open http://localhost:3000, register (you get 1000 Coins), create a room, and share the invite
code. **Dealing needs players in the database** — the game can only start once you've added
some (see *Data is data-driven* below); with an empty `players` table the deal will fail.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `packages/db/.env`, `apps/web/.env.local`, `apps/game-server/.env.local` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | `packages/db/.env` (optional) | Throwaway DB for the wallet/bank test suite |
| `AUTH_SECRET` | `apps/web/.env.local` **and** `apps/game-server/.env.local` | **Must be identical in both.** The web signs the Socket.IO session token; the game server verifies it. If they drift, every socket connection is rejected. |
| `AUTH_URL` | `apps/web/.env.local` | Base URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_GAME_SERVER_URL` | `apps/web/.env.local` | Socket.IO URL the browser connects to (e.g. `http://localhost:4000`) |
| `GAME_SERVER_PORT` | `apps/game-server/.env.local` | Port the Socket.IO server listens on (default 4000) |
| `WEB_ORIGIN` | `apps/game-server/.env.local` | Allowed CORS origin (the web app) |

## Quality gates

```bash
pnpm typecheck     # tsc --noEmit, all packages
pnpm lint          # ESLint (flat config), whole monorepo
pnpm test          # all vitest suites (wallet/bank suites need a live, migrated DB)
pnpm --filter @fp/web build   # production build of the web app
```

The wallet/bank suites hit a real PostgreSQL because the guarantees under test — `SELECT … FOR
UPDATE` row locking, the balance CHECK, idempotency, and the 2×/24h limit under concurrency —
are database behavior. Start Postgres and run `pnpm db:deploy` (or set `TEST_DATABASE_URL`)
first.

## Data is data-driven (SPEC §2, §17)

No football player/club/nationality/rank name is hardcoded. Only **game rules** are seeded: the
4 Positions and the 9 HandRanks. The owner supplies the player database later.

- **Add players / clubs / nationalities:** insert rows into `nationalities`, `clubs`, `players`,
  `player_clubs` (via `pnpm --filter @fp/db studio`, SQL, or an admin tool). No code change. The
  server deals random active players from this table.
- **Edit / add an association (HandRank):** edit a row in `hand_ranks`. `strength` orders ranks;
  `name_ar` is the display name shown at showdown (read live from the DB — no redeploy); `rule`
  (jsonb) is the Rule DSL the engine interprets. The game server loads ranks at startup, so a
  restart picks up edits.

### Rule DSL (stored in `hand_ranks.rule`)

```jsonc
{ "type":"group", "attribute":"nationality"|"position"|"club", "min":N, "match":"shared"|"identical" }
//   shared (default): single-valued = same value | club = at least one shared club
//   identical: club only = an exactly-matching full club set
{ "type":"coverage", "attribute":"position", "values":"all" }   // covers GK+DEF+MID+FWD
{ "type":"anyOf", "rules":[ ... ] }                             // OR
{ "type":"allOf", "disjoint":true|false, "rules":[ ... ] }      // AND; disjoint ⇒ each rule needs its own cards
```

Limits: `attribute` is `nationality | position | club`; `coverage` applies to `position` only;
`match:"identical"` applies to `club` only. `HAND_SIZE = 5` (SPEC §19.1) — the `min:5` in the
Royals and Full-House-Club derives from it. The mandatory semantics (TRIPLE/FULL_HOUSE never use
club; PAIR/TWO_PAIR/FULL_HOUSE_CLUB/ROYAL_CLUB do) come from how each rank's rule is composed.

## Useful scripts (root)

| Script | Action |
|---|---|
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:deploy` | Apply pending migrations |
| `pnpm db:seed` | Seed Positions + HandRanks (idempotent) |
| `pnpm db:reset` | Drop, re-migrate, reseed |
| `pnpm typecheck` | Typecheck every package |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm test` | Run all test suites |
