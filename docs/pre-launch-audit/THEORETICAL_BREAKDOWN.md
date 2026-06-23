# Football Poker — Theoretical Breakdown (Logical Sections Map)

- **Project:** Football Poker (فوتبول بوكر) — `Poker-App` monorepo
- **Audit date:** 2026-06-23
- **Nature:** READ-ONLY pre-launch audit. **No file in the project was modified.** This document is a *paper map only* — no file was moved, renamed, or reorganized. It labels and groups the code exactly as it already exists on disk.

---

## Architecture overview (how the sections tie together)

Football Poker is a server-authoritative, real-time multiplayer card game with a Texas-Hold'em *structure* but a football-knowledge *winning logic* (players are scored by shared nationality / position / club career across 9 "association" ranks). It is a **pnpm + Turborepo monorepo** with two runtime processes and three shared packages:

```
        Browser (Next.js client, RTL Arabic UI)
          │  REST / SSR (httpOnly cookie session)      │  Socket.IO (signed realtime token)
          ▼                                            ▼
   apps/web  (Next.js 15) ───────────────────►  apps/game-server (Node + Socket.IO)
          │  Prisma                                    │  Prisma (DB transactions, row locks)
          ▼                                            ▼
                         PostgreSQL  (append-only wallet ledger = source of truth)

   Shared logic (imported by both processes):
     packages/shared  — enums, constants, Zod contracts, WS event contracts, 9-rank DSL, badges, rate limiter
     packages/engine  — PURE rules: hand evaluation, betting, side pots, fold, resolve (no I/O)
     packages/db      — Prisma schema + migrations + wallet/bank/stats services (only package that touches the DB)
```

The **game-server is the only referee**: no bet validity, turn order, winner, hand evaluation, or balance change ever happens on the client. The game-server holds authoritative room state **in memory** and depends on a set of **ports** (`CardSource`, `RoomPersistence`, `Emitter`, `TimerService`, `Clock`, optional `bots`) so the full hand flow is testable with fakes. Money is **BigInt** on the server/DB and only narrows to `number` at the WebSocket boundary. Every coin movement flows through an append-only ledger with `SELECT … FOR UPDATE` row locks and idempotency keys. Dependency direction: `web → {db, shared}`, `game-server → {db, engine, shared}`, `db → shared`, `engine → shared`; `engine` never imports `db` (stays pure).

---

## Section 1 — Database & data layer

**Responsibility:** The single owner of all persistent state and the only package that talks to PostgreSQL. Defines the schema, migrations, seed (game rules only), and the wallet/bank/stats/session/install-reward primitives.

| Path | Role |
|---|---|
| `packages/db/prisma/schema.prisma` | Full schema: identity/wallet/social, 4-layer stats/progression, football reference data, game session. snake_case via `@@map`, uuid PKs, timestamptz, `directUrl` split. |
| `packages/db/prisma/migrations/` | 18 ordered migrations (`20260614000000_init` … `20260622000003_level_up_celebration`). Init adds the `wallets_balance_nonneg` CHECK and restarts `player_number` at 100001. |
| `packages/db/prisma/seed.ts` | Idempotent seed of game rules ONLY: 4 Positions + 9 HandRanks + 5 Badges (upsert by code). No football player ever seeded. |
| `packages/db/src/client.ts` | Singleton PrismaClient (cached on `globalThis` in dev). |
| `packages/db/src/wallet.ts` | **The ledger primitive** (`applyWalletTransaction`): row lock → idempotency by `reference` → sufficiency → ledger insert + balance update in one tx. `registerUserWithWallet`, `getWalletBalance`. |
| `packages/db/src/bank.ts` | Level-based daily bank claim (`level × 1000`, once per Riyadh day), row-locked + ledger-credited. |
| `packages/db/src/install-reward.ts` | One-time 10,000-coin PWA-install reward, once-per-account flag + ledger credit in one tx. |
| `packages/db/src/metrics.ts` | Stats Layers 2–4 aggregation (incremental, idempotent via `last_seq`), badge awarding, XP/level, `acknowledgeLevelUp`. |
| `packages/db/src/session.ts` | Inactivity auto-logout helpers (`touchUserActivity` throttled/guarded, `isSessionInactive` fails open). |
| `packages/db/src/errors.ts` | Arabic-safe domain errors (Wallet/Insufficient/UsernameTaken/BankLimit). |
| `packages/db/src/index.ts` | Public package surface. |
| `packages/db/tests/` | `wallet.test.ts`, `bank.test.ts`, `install-reward.test.ts`, `level-up.test.ts` (hit a real Postgres). |

---

## Section 2 — Game engine & game logic (pure)

**Responsibility:** Pure, I/O-free interpretation of the data-driven rules: hand-rank evaluation (witness search), betting-round mechanics, layered side pots, fold accounting, and showdown resolution. Never imports `db`. Also home to the bot decision engine (pure) and the fame-score / badge / XP logic (in `shared`).

| Path | Role |
|---|---|
| `packages/engine/src/evaluate.ts` | Witness enumeration (boolean + "explained") over the Rule DSL — the heart of rank evaluation. |
| `packages/engine/src/engine.ts` | Public API: `parseRule`, `achievableRanks`, `bestAchievableRank`, `validateClaim`, `resolveByStrength`. |
| `packages/engine/src/betting.ts` | Legal actions, `applyAction`, round open/complete, first/next-to-act, raise reopening. |
| `packages/engine/src/pots.ts` | `buildSidePots` (layered) + `totalPot`. |
| `packages/engine/src/fold.ts` | `computeFold` — forfeit (half ante / half last bet) vs. immediate refund. |
| `packages/engine/src/resolve.ts` | `resolveShowdown` → settlements (WIN/SPLIT_WIN/REFUND/FOLD_FORFEIT), `netBySeat`. |
| `packages/engine/src/types.ts`, `index.ts` | Engine types + barrel export. |
| `packages/shared/src/handRanks.ts` | The Rule DSL + 9-rank catalog (single source of truth; seeded + interpreted). |
| `packages/shared/src/badges.ts` | Badge rule DSL + catalog, `deriveMetricView`, `computeXp`, `levelForXp`. |
| `apps/game-server/src/bots/strategy.ts` | **Pure** bot decision engine (`decide`, personalities, `handStrength`) — reuses the engine evaluator. |
| `packages/engine/tests/` | `betting`, `pots`, `fold`, `resolve`, `engineApi`, `explain`, `handRanks` (84 tests). |

---

## Section 3 — Real-time layer (Socket.IO game server)

**Responsibility:** The authoritative game runtime — in-memory room state machine, turn/claim timers, matchmaking, crash recovery, and all money writes inside DB transactions. The only referee.

| Path | Role |
|---|---|
| `apps/game-server/src/index.ts` | Bootstrap: per-IP connection rate limiter → token auth + inactivity check → crash recovery → load ranks → optional bots → attach handlers → internal `/internal/rooms` endpoint. |
| `apps/game-server/src/socket.ts` | All Socket.IO handlers (the wire): join/leave/close/start/next/action/claim/ready/queue; seating; teardown; `SocketEmitter`; `buildStateSync` (no hole cards). |
| `apps/game-server/src/room.ts` | `GameRoom` — the state-machine core: deal, antes, betting, streets, showdown (MANUAL/AUTO), resolve, side pots, fold refund, ready-check, host transfer, void-on-close, bot isolation. |
| `apps/game-server/src/cards.ts` | `TableDeck` (single-deck no-repeat, Fisher–Yates) + `PrismaCardSource` (difficulty fame-score filter). |
| `apps/game-server/src/matchmaking.ts` | Quick Play FIFO queues per tier; fill windows; cold-start bot-fill; presentational lobby ramp. |
| `apps/game-server/src/persistence.ts` | `PrismaRoomPersistence` — every method in one tx (wallet movements + game records). |
| `apps/game-server/src/recovery.ts` | Boot reconciliation of orphaned IN_PROGRESS games (positional last-resolve ledger split; pure `computeOrphanRefunds`). |
| `apps/game-server/src/factory.ts` | `loadRanks` (data-driven) + `hydrateRoom` from the DB. |
| `apps/game-server/src/presence.ts` | `hasConnectedHuman` — counts humans only (bot-teardown fix). |
| `apps/game-server/src/ports.ts`, `types.ts`, `store.ts`, `timers.ts` | Interfaces, in-memory state types, room registry, Node timers/clock. |
| `apps/game-server/src/bots/` | `controller`, `runtime`, `pool`, `seating`, `identities`, `profile`, `seed-bots` (cold-start fillers, behind `BOTS_ENABLED`, ledger/stats-isolated). |
| `apps/game-server/tests/`, `smoke/` | 13 unit/integration suites (room, multi-hand, recovery, bots, auth, rate-limit, presence, table-deck) + full-hand smoke e2e. |

---

## Section 4 — Web app (routing, pages, UI, client↔server)

**Responsibility:** All REST/SSR (auth, profile, stats, bank, rooms, social, install-reward, level-up) and the RTL Arabic table UI + Socket.IO client. Stateless; horizontally scalable.

| Path | Role |
|---|---|
| `apps/web/src/app/api/**` | REST routes: `auth/{[...nextauth],logout,register}`, `bank/claim`, `install-reward/claim`, `level-up/ack`, `profile/{me,p/[playerNumber],avatar/*}`, `rooms`, `social/{like,friend,friend/respond}`, `stats/me`. |
| `apps/web/src/app/**/page.tsx` | Pages: login, register, rooms, create-room, quick-play, `table/[gameId]` (mints realtime token), bank, profile, stats, friends, rank, guide. |
| `apps/web/src/app/{login,register,rooms}/actions.ts` | Server actions (sign-in, register+sign-in, join-by-code). |
| `apps/web/src/lib/realtime.ts` | Typed `socket.io-client` wrapper + sound cues. |
| `apps/web/src/lib/useGameSocket.ts` | Folds server events into one view model (presentation state; re-synced from `state:sync`). |
| `apps/web/src/lib/tableView.ts` (+ `.test.ts`) | Pure selectors / state folding (unit-tested). |
| `apps/web/src/components/table/*` | `game-table`, `parts`, `fx`, `opponent-profile-modal` — the live table. |
| `apps/web/src/components/**`, `ui/**` | Shared UI + shadcn primitives. |
| `apps/web/public/sw.js`, `src/components/sw-register.tsx`, `lib/pwa.ts`, `app/manifest.ts` | PWA service worker + install handling. |

---

## Section 5 — Authentication & sessions

**Responsibility:** Identity, password hashing, session lifetime, and the bridge between the web session and the game-server socket.

| Path | Role |
|---|---|
| `apps/web/src/auth.ts` | Auth.js (Credentials) config; JWT session; inactivity `maxAge`; `jwt`/`session` callbacks; touches activity. |
| `apps/web/src/lib/argon.ts` | argon2id hashing (OWASP params) + verify. |
| `apps/web/src/lib/realtime-token.ts` | Mints the short-lived (12h) HS256 realtime token from the verified session (server-only). |
| `apps/web/src/lib/rate-limit.ts` | Per-IP auth limit + per-user bank limit (in-memory). |
| `apps/web/src/types/next-auth.d.ts` | Session type augmentation (`id`, `playerNumber`). |
| `apps/game-server/src/auth.ts` | `verifyRealtimeToken` (jose) — identity ONLY from verified claims. |
| `packages/shared/src/auth.schemas.ts` | Zod for username/password/login/register + realtime claims. |
| `packages/db/src/session.ts` | Server-side inactivity enforcement (shared threshold). |

---

## Section 6 — Infrastructure, deployment & config

**Responsibility:** How the three services build, deploy (Railway), route (Cloudflare), and are configured. Plus the migrate-first operational discipline.

| Path | Role |
|---|---|
| `railway.toml` | NIXPACKS build; `numReplicas = 1` (game-server in-memory state); per-service build/start/vars in comments. |
| `DEPLOY.md` | Step-by-step Railway runbook; Cloudflare DNS (`poker`/`poker-rt`); prod data import + the required `position_id` remap. |
| `CLAUDE.md` (Deploy-safety section), `MASTER FILE.txt` §14/§16 | The **migrate-first rule** (post-incident 2026-06-21). |
| `docker-compose.yml` | Local PostgreSQL 16. |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.node-version`/`.nvmrc`, `.npmrc` | Monorepo scripts, workspaces, build pipeline, strict TS, lint config, Node 20 pin. |
| `.env.example` (root + per app/package) + `.env.production.example` | Env templates (placeholders only — no secrets committed). |

---

## Section 7 — External integrations & scripts

**Responsibility:** Offline data loading and maintenance — never on the gameplay path.

| Path | Role |
|---|---|
| `packages/db/prisma/import-api-football.ts` | One-time API-Football importer (players/clubs/nationalities; key from env; idempotent by `external_ref`). |
| `packages/db/prisma/import-tournament-stats.ts`, `differential-import.ts` | Tournament-stat + differential imports (resumable, gitignored checkpoints). |
| `packages/db/prisma/transliterate-names.ts` | Fills `name_ar` via `@anthropic-ai/sdk` (offline). |
| `packages/db/prisma/calculate-scores.ts` | Computes `fame_score` / `tier` / `legend_score` (Messi-normalized). |
| `packages/db/prisma/{sync-scores-to-prod,topup-wallets,backfill-fixes,seed-players,_ensure-system-ca}.ts` | Ops/one-off helpers. |
| `packages/db/scripts/{grant-bonus,abandon-game}.ts` (+ `README.md`) | Idempotent ops scripts (go through the wallet primitive). |
| `apps/game-server/src/bots/seed-bots.ts` (+ `identities.json`, `avatars/`) | Seeds bot identities + downscaled avatars. |
| `apps/web/scripts/gen-icons.mjs` | PWA icon generation. |

---

## Section 8 — Shared utilities / types / contracts

**Responsibility:** The single cross-process source of truth for enums, constants, validation, WS contracts, the rule/badge DSLs, and the rate limiter — so the web and game-server agree exactly and mirror the Prisma enums.

| Path | Role |
|---|---|
| `packages/shared/src/enums.ts` | All string-literal unions (mirror Prisma enums) + `DIFFICULTY_MIN_SCORE`, `RESOLVE_MODES`. |
| `packages/shared/src/constants.ts` | `DEFAULT_GAME_CONFIG`, `QUICK_PLAY`, signup/bank/install amounts, inactivity window, bot base number. |
| `packages/shared/src/ws.ts` | CLIENT/SERVER event names, Zod input schemas, all typed payloads. |
| `packages/shared/src/handRanks.ts`, `badges.ts`, `profile.ts`, `auth.schemas.ts`, `rate-limit.ts` | Rule/badge DSLs, nickname/avatar validation, auth schemas, pure rate limiter. |
| `packages/shared/src/index.ts` | Barrel export. |

---

*End of theoretical breakdown. This is a classification of existing files only — nothing was moved or changed.*
