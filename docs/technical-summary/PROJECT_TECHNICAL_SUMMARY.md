# Link Up (لينك اب) — Project Technical Summary

- **Project name:** Link Up (`link-up` / repo `link-up`)
- **Last updated:** 2026-06-23
- **Repository:** https://github.com/fahadv2sa/link-up.git
- **Production deploy branch:** `feat/fame-score-system`
- **Project root (local):** `C:\Users\Admin\OneDrive\Desktop\Football B\link-up`

> **Overview.** Link Up is a server-authoritative, online, multiplayer card game with a Texas-Hold'em *structure* (rooms, a mandatory opening bet, betting rounds, community cards, showdown, side pots) but a completely different *winning logic*: each "card" is a real football player, and hands are scored by **football knowledge** — the relationships between players by **nationality, position, and club career history** — across 9 "association" ranks. The UI is fully Arabic, right-to-left (RTL), premium dark theme. The system is a pnpm + Turborepo monorepo split into a stateless Next.js web app, a single always-on Socket.IO authoritative game server, a pure rules engine, a Prisma/PostgreSQL data layer, and a shared contracts package. Money is a virtual "Coins" economy backed by an append-only wallet ledger with DB transactions, row locks, and idempotency keys. It is deployed to Railway (three services) with Cloudflare DNS at `poker.fmgtech.dev` (web) and `poker-rt.fmgtech.dev` (realtime).

---

## 0. How this document was produced & source-of-truth notes

This summary was built by reading the actual files in the repository: `CLAUDE.md`, `README.md`, `DEPLOY.md`, `GAMEPLAY_AUDIT.md`, `MASTER FILE.txt`, `railway.toml`, all `package.json` files, `pnpm-lock.yaml`/`pnpm-workspace.yaml`, `packages/db/prisma/schema.prisma` + the migrations directory, `packages/shared/src/{constants,enums}.ts`, the `.env.example` files, `packages/db/scripts/README.md`, and the source-tree listings of every package.

Important meta-notes:

- **The "MASTER FILE" requested by the task is `MASTER FILE.txt` at the project root** (a 1,162-line self-contained onboarding reference). It is the canonical human-written reference and is largely accurate, but the live code has **evolved past it** in a few places. Where the code and `MASTER FILE.txt`/`CLAUDE.md` disagree, this document reports the **code value** and flags the divergence.
- **`SPEC.md` (the original Arabic authoritative spec) is referenced by `CLAUDE.md`/`README.md` as living at `C:\Users\Admin\OneDrive\Desktop\SPEC.md` — i.e. on the Desktop, NOT inside the repo.** It is therefore **Not found in the codebase** itself; only the derived docs (`CLAUDE.md`, `MASTER FILE.txt`) are in-repo.
- There is no pre-existing `docs/` folder in the repo other than this `docs/technical-summary/` created for this deliverable.

---

## 1. Mandatory reading sources — inventory

| Source | Location | Role |
|---|---|---|
| `CLAUDE.md` | repo root | Quick-reference card; contains the binding "Section 19" decisions, the fame-score spec, the **migrate-first deploy rule** (post-incident), and the Quick Play bots spec. **Current.** |
| `MASTER FILE.txt` | repo root | Canonical, self-contained onboarding reference (the "MASTER FILE"). 18 sections. Accurate-to-code as of 2026-06-21 with a few noted divergences. |
| `README.md` | repo root | Setup, run, environment variables, scripts, data-driven model + Rule DSL. |
| `DEPLOY.md` | repo root | Railway deployment runbook (3 services), Cloudflare DNS, prod data import incl. the position-id remap. |
| `GAMEPLAY_AUDIT.md` | repo root | **Dated 2026-06-17, partly outdated** runtime audit of client-side UX gaps. Several items since fixed (see §10). |
| `packages/db/scripts/README.md` | `packages/db/scripts/` | The only package-level doc. Documents the two ops scripts (`grant-bonus.ts`, `abandon-game.ts`). |

There are **no** package-level README/`*.md` files inside `apps/web`, `apps/game-server`, or `packages/engine`. (Marked here so a reader doesn't go hunting.)

---

## 2. Monorepo structure (pnpm workspaces + Turborepo)

`pnpm-workspace.yaml` declares workspaces `apps/*` and `packages/*`. Package manager pinned to `pnpm@9.15.9`; Node pinned to `20` (`.nvmrc`/`.node-version` = `20`; `engines` = `node: "20", pnpm: "9"`). Turborepo (`turbo ^2.5`) orchestrates `build/dev/lint/typecheck/test`.

| Workspace | Import name | Responsibility |
|---|---|---|
| `apps/web` | `@fb/web` | Next.js 15 (App Router) — all REST/SSR (auth, profile, stats, bank, rooms, social, install-reward, level-up) **and** the RTL table UI + Socket.IO client. Stateless; horizontally scalable. |
| `apps/game-server` | `@fb/game-server` | Node + Socket.IO **authoritative** game server: in-memory room state, the state machine, in-process turn/claim timers, all money writes inside DB transactions, Quick Play matchmaking, crash recovery, and the (flagged) Quick Play bots. **Must run as a single instance (replicas = 1).** |
| `packages/db` | `@fb/db` | Prisma schema + migrations + seed + the wallet/bank primitives + stats aggregation + the data import/score scripts. The only package that touches the DB. |
| `packages/engine` | `@fb/engine` | The pure Football Hand Engine + betting/pots/fold/resolve math. **No I/O, no DB, no clock.** Fully unit-testable. |
| `packages/shared` | `@fb/shared` | Enums, constants, Zod contracts, the WebSocket event contracts (`ws.ts`), the 9-rank catalog + Rule DSL (`handRanks.ts`), the badge catalog (`badges.ts`), profile helpers, the rate limiter. Single source of truth for cross-process types. |

**Dependency direction:** web → {db, shared}; game-server → {db, engine, shared}; db → shared; engine → shared. `shared` depends on nothing internal; `engine` never imports `db` (stays pure).

### Source tree (key files)

```
apps/web/src/
  app/                       App Router pages + API routes
    api/                     auth/{[...nextauth],logout,register}, bank/claim,
                             install-reward/claim, level-up/ack, profile/{me,p/[playerNumber],
                             avatar/...}, rooms, social/{like,friend,friend/respond},
                             stats/me
    table/[gameId]/page.tsx  live table entry (mints the realtime token)
    create-room, rooms, quick-play, bank, profile, stats, friends, guide,
      rank, login, register   (pages)
    layout.tsx, globals.css
  auth.ts                    Auth.js (Credentials) config
  lib/                       realtime.ts (socket client), useGameSocket.ts (event→view),
                             tableView.ts (pure selectors), realtime-token.ts (mint JWT),
                             argon.ts, social.ts, stats.ts, sound.ts, rate-limit.ts
  components/                table/ (game-table, parts, fx), ui/ (shadcn), profile-*, etc.

apps/game-server/src/
  index.ts        bootstrap: rate-limit + auth middleware, recovery, load ranks, bots, listen
  socket.ts       all Socket.IO handlers (the wire layer)
  room.ts         GameRoom — the authoritative state machine (core)
  cards.ts        TableDeck (single-deck no-repeat) + PrismaCardSource (difficulty filter)
  matchmaking.ts  Quick Play queues (per difficulty tier)
  persistence.ts  PrismaRoomPersistence (DB transactions)
  recovery.ts     startup reconciliation of orphaned IN_PROGRESS games
  factory.ts      hydrateRoom() + loadRanks() from the DB
  auth.ts         verifyRealtimeToken() (jose)
  presence.ts     activity/presence tracking
  store.ts        InMemoryRoomStore
  timers.ts       NodeTimerService + systemClock
  ports.ts        interfaces GameRoom depends on (CardSource, RoomPersistence, Emitter, …)
  types.ts        RoomState / RoomPlayer / DealtCard / RankInfo
  bots/           strategy.ts, controller.ts, pool.ts, seating.ts, runtime.ts,
                  identities.ts, identities.json, profile.ts, seed-bots.ts, avatars/
  tests/, smoke/  unit/integration tests + full-hand smoke e2e

packages/engine/src/   engine.ts, evaluate.ts, betting.ts, pots.ts, fold.ts, resolve.ts, types.ts, index.ts
packages/shared/src/   enums.ts, constants.ts, handRanks.ts, badges.ts, profile.ts,
                       auth.schemas.ts, ws.ts, rate-limit.ts, index.ts
packages/db/
  prisma/  schema.prisma, migrations/, seed.ts, seed-players.ts,
           import-api-football.ts, import-tournament-stats.ts, differential-import.ts,
           transliterate-names.ts, calculate-scores.ts, sync-scores-to-prod.ts,
           topup-wallets.ts, backfill-fixes.ts, _ensure-system-ca.ts
  src/     client.ts, wallet.ts, bank.ts, metrics.ts, errors.ts, index.ts, generated/client/
  scripts/ abandon-game.ts, grant-bonus.ts, README.md
```

---

## 3. Tech stack & versions (verified from `package.json` files)

**Frontend (`@fb/web`):**
- Next.js `^15.1.6` (App Router), React `^19.0.0`, React-DOM `^19.0.0`, TypeScript `^5.6.3`
- Tailwind CSS v4 (`tailwindcss ^4.3.1`, `@tailwindcss/postcss ^4.3.1`, `tw-animate-css`), shadcn/ui via `radix-ui ^1.5.0`, `framer-motion ^12.40.0`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`
- `next-auth 5.0.0-beta.25` (Auth.js), `jose ^6.2.3` (JWT mint/verify), `@node-rs/argon2 ^2.0.2` (argon2id)
- `socket.io-client ^4.8.3`, `zod ^3.23.8`
- Tests: `vitest ^2.1.9`

**Game server (`@fb/game-server`):**
- Node 20 (engines pin; README notes it also runs on 24)
- `socket.io ^4.8.0`, `tsx ^4.19.1` (runs the TypeScript source directly — no build step at deploy), `jose ^6.2.3`, `@node-rs/argon2 ^2.0.2` (room-password verify), zod via `@fb/shared`
- Dev: `sharp ^0.34.5` (bot avatar downscaling), `socket.io-client`, `vitest ^2.1.3`

**Database (`@fb/db`):**
- PostgreSQL 14+ (Docker image `postgres:16-alpine` locally); Prisma `^6.2.1` (`@prisma/client` + `prisma` CLI)
- Generated Prisma client output: `packages/db/src/generated/client` (git-ignored path → regenerated by `postinstall`)
- `@anthropic-ai/sdk ^0.104.2` — used **only** by the offline `transliterate-names.ts` script (Arabic player names), not by runtime gameplay
- Dev: `dotenv`, `tsx`, `vitest ^2.1.3`

**Tooling / monorepo (root):**
- pnpm workspaces (`pnpm@9.15.9`) + Turborepo (`turbo ^2.5.0`)
- ESLint 10 flat config (`eslint ^10.5.0`, `@eslint/js`, `typescript-eslint ^8.61.0`, `@next/eslint-plugin-next`, `eslint-plugin-react-hooks`) — `eslint.config.mjs`
- `vitest` for all test suites; Docker Compose for local PostgreSQL
- Hosting: Railway (NIXPACKS builder); DNS via Cloudflare

**Forbidden by spec:** Firebase / NoSQL as the game backbone; any sensitive logic in the browser.

---

## 4. Database layer (`packages/db`)

Defined in `packages/db/prisma/schema.prisma`. **Conventions:** all PKs are `uuid`; all timestamps are `timestamptz`; tables/columns are snake_case via `@@map`/`@map`. Datasource uses `url = env("DATABASE_URL")` (runtime, pooled) and `directUrl = env("DIRECT_URL")` (Prisma Migrate). Only **Positions + HandRanks + Badges** are ever seeded; no real football player is seeded (data-driven).

### 4.1 Tables / models

**Identity, wallet, social:**

| Table (`@@map`) | Key fields |
|---|---|
| `users` | `id` uuid PK; `player_number` SERIAL unique (starts 100001, shown as `#100001`); `username` unique; `nickname` (display, nullable, NOT unique); `password_hash` (argon2id); `avatar_seed`; `likes_received` (denormalized); `last_active_at` (inactivity auto-logout watermark); `install_reward_at` (one-time install reward); timestamps |
| `wallets` | `user_id` unique; `balance` BigInt default 1000; `highest_balance`. **DB CHECK `balance >= 0`** (`wallets_balance_nonneg`). Balance mutated only in lockstep with a ledger insert |
| `wallet_transactions` | **The append-only ledger / financial source of truth:** `user_id`, `game_id?`, `type` (`WalletTxType`), `amount` (signed BigInt), `balance_after`, `reference` **UNIQUE (= idempotency key)**, `metadata` jsonb, `created_at` |
| `bank_claims` | One row per bank top-up (used to enforce the claim limit). Now also logs `level` + `balance_after` for the level-based daily claim |
| `user_stats` | Simple per-user counters: `games_played`, `wins`, `losses`, `folds`, `total_coins_won/lost`, `net_profit_loss`. Updated at resolve |
| `user_avatars` | Uploaded avatar `data` Bytes + `mime_type` (DB-stored; Railway FS is ephemeral) |
| `likes` | One row per `(liker_id, target_id)` unique; toggles `users.likes_received` |
| `friendships` | Directional request `(requester_id, addressee_id)` unique, `status` (`PENDING/ACCEPTED/REJECTED`); active only when ACCEPTED |

**Stats & progression (4-layer system, keyed on `User.id`):**

| Table | Layer | Key fields |
|---|---|---|
| `play_events` | 1 — raw append-only log | `seq` BigInt PK (monotonic watermark), `player_id`, `game_id?`, `hand_number`, `type` (`PlayEventType`: BET/RAISE/CALL/CHECK/FOLD/ALLIN/ROUND_SUMMARY), `value`, `metadata` jsonb |
| `player_metrics` | 2 — precomputed read model | matches/wins/losses/folds, net/total won/lost, showdown/bluff/weak-won counts, bet-to-pot & luck sums, biggest pot/win/loss, win streaks, **Layer 4** `xp`/`level`/`celebrated_level`, `last_seq` (aggregation watermark — incremental + idempotent) |
| `badges` | 3 — data-driven defs | `code` unique, `name_ar`, `description_ar`, `icon`, `sort_order`, `active`, `rule` jsonb. Add a badge = insert a row |
| `player_badges` | 3 — awards | `(user_id, badge_id)` unique ⇒ granted once |

**Football reference data (owner-supplied; only Positions seeded):**

| Table | Key fields |
|---|---|
| `nationalities` | `name` unique, `iso_code?`, `flag_emoji?` |
| `positions` | `code` (`PositionCode` GK/DEF/MID/FWD) unique, `name_ar`, `name_en`. **SEEDED** |
| `clubs` | `name` unique, `country_id?`, `logo_url?`, `kind` (`ClubKind`: CLUB / NATIONAL_TEAM / NATIONAL_YOUTH / YOUTH_CLUB) |
| `players` | `name`, `name_ar?`, `external_ref?` unique (API-Football id; importer idempotency key), `nationality_id`, `position_id`, `birth_year?`, `photo_url?`, `active`, plus the fame system: `top5_league_seasons`, `fame_score?`, `tier?` (1–4), `is_legend`, `legend_score?`. **The fame fields are DISPLAY/DIFFICULTY only — never used by the rank engine.** FK `onDelete: Restrict` on nationality/position |
| `player_clubs` | **CLUB CAREER HISTORY (kind=CLUB only):** `(player_id, club_id, from_year?, to_year?)`. **This is what the rank engine keys on for the club-based ranks** |
| `player_national_teams` | `(player_id, club_id)` unique — national-team appearances, split out of `player_clubs`. Engine never sees them |
| `player_youth_clubs` | `(player_id, club_id)` unique — youth-academy appearances, split out. Engine never sees them |
| `player_tournament_stats` | `(player_id, tournament_type)` unique with `appearances` count (`TournamentType`: WORLD_CUP / EURO_COPA / CHAMPIONS_LEAGUE). Feeds the fame score |
| `hand_ranks` | The 9 ranks: `code` unique, `name_ar`, `name_en`, `strength` unique, `rule` jsonb (Rule DSL), `description_ar?`, `examples?`, `active`. **SEEDED + editable** |

**Game session (rooms are temporary; results/ledger persist):**

| Table | Key fields |
|---|---|
| `games` | `room_name`, `is_private`, `kind` (`GameKind` MANUAL/QUICK_PLAY — authoritative room type), `password_hash?`, `max_players`, `invite_code` unique, `status` (`GameStatus`), `difficulty` (`Difficulty`, default MEDIUM), `created_by`, `config` jsonb, `phase` (`GamePhase`), `pot` BigInt, `pots` jsonb (side pots at resolve), `current_bet`, `dealer_seat?`, `current_turn_seat?`, timestamps |
| `game_players` | `(game,seat)` unique & `(game,user)` unique; `status` (`GamePlayerStatus`), `hole_cards` jsonb **(SERVER ONLY — never broadcast)**, `committed_total`, `committed_this_round`, `last_bet_amount`, `joined_at`, `left_at?` |
| `game_cards` | `card_type` (HOLE/COMMUNITY), `owner_seat?`, `community_index?` (0–4), `football_player_id`, `revealed` |
| `bets` | Append log of every betting action: `round` (`BetRound`), `action` (`BetAction`), `amount`, `sequence` |
| `player_hand_claims` | Showdown claims: `claimed_hand_rank_id?`, `is_valid`, `best_possible_rank_id?` |
| `game_results` | Per-seat outcome `outcome` (`ResultOutcome` WIN/SPLIT/LOSE/FOLD/REFUND), `coins_delta`, `final_balance` |

### 4.2 Enums (Prisma)

`WalletTxType` (SIGNUP_BONUS, BANK_CLAIM, ANTE, BET, RAISE, ALLIN, WIN, SPLIT_WIN, REFUND, FOLD_FORFEIT, **INSTALL_REWARD**), `PositionCode`, `GameStatus`, `GameKind`, `GamePhase`, `GamePlayerStatus`, `CardType`, `BetRound`, `BetAction`, `ResultOutcome`, `TournamentType`, `Difficulty`, `FriendStatus`, `PlayEventType`, `ClubKind`.

> Note: `INSTALL_REWARD` is present in the schema enum but is **not** listed in `CLAUDE.md`/`MASTER FILE.txt`'s movement-type list — a code-ahead-of-docs divergence.

### 4.3 Migrations (chronological, `packages/db/prisma/migrations/`)

```
20260614000000_init
20260617151738_add_player_name_ar
20260618000000_add_player_external_ref
20260618170820_add_fame_and_tournament_stats
20260618172229_add_difficulty_and_tier
20260620211004_add_player_is_legend
20260620212644_add_player_legend_score
20260621090000_merge_very_easy_into_easy
20260621123000_split_national_teams_from_clubs
20260621140000_stats_progression_system
20260621160000_profile_layer
20260621180000_social_layer
20260621200000_friend_requests
20260621220000_game_kind
20260622000000_add_user_last_active_at
20260622000001_bank_claim_log
20260622000002_install_reward
20260622000003_level_up_celebration
```

The last four (`last_active_at`, `bank_claim_log`, `install_reward`, `level_up_celebration`) are newer than `MASTER FILE.txt`'s narrative migration list and correspond to inactivity auto-logout, the level-based daily bank claim, the one-time install reward, and the level-up celebration feature.

---

## 5. Game engine (`packages/engine`) + game rules

Pure functions only — no I/O, DB, or clock. Files: `engine.ts` (public API), `evaluate.ts` (witness search), `betting.ts`, `pots.ts`, `fold.ts`, `resolve.ts`, `types.ts`.

### 5.1 The 9 hand-ranks (associations)

Stored in `hand_ranks`, seeded from `HAND_RANK_CATALOG` in `packages/shared/src/handRanks.ts`, interpreted at runtime by the engine. `name_ar` is read **live** from the DB and shown at showdown. `HAND_SIZE = 5`.

| Strength | Code | Arabic | Condition (**as the code actually is**) |
|---|---|---|---|
| 9 | `ROYAL_CLUB` | رويال النادي | 5 cards sharing ≥1 club |
| 8 | `ROYAL_NATION` | رويال الجنسية | 5 cards same nationality |
| 7 | `ROYAL_POSITION` | رويال المراكز | 5 cards same position |
| 6 | `FULL_HOUSE_CLUB` | فل هاوس كلوب | 4 cards sharing ≥1 club |
| 5 | `LINEUP` | تشكيلة | covers all 4 positions (GK/DEF/MID/FWD) |
| 4 | `FULL_HOUSE` | فل هاوس | 3 sharing a club + a **disjoint** 2 sharing a club (clubs only) |
| 3 | `TRIPLE` | ثلاثي | 3 cards sharing ≥1 club |
| 2 | `TWO_PAIR` | زوجين | two **disjoint** pairs, each sharing a club |
| 1 | `PAIR` | زوج | 2 cards sharing ≥1 club |

> **⚠️ CRITICAL DIVERGENCE (code vs. `CLAUDE.md`/SPEC table).** `CLAUDE.md` describes PAIR/TWO_PAIR as nationality/position/club and TRIPLE/FULL_HOUSE as nationality-or-position (not club), and also shows a different strength ordering for FULL_HOUSE/LINEUP. **The code has evolved:** in `handRanks.ts` the four lower ranks (PAIR, TWO_PAIR, TRIPLE, FULL_HOUSE) are now **CLUBS-ONLY** (comment: "Nationality and position NO LONGER trigger PAIR / TWO_PAIR / TRIPLE / FULL_HOUSE"), and `MASTER FILE.txt` confirms the ordering above. Whatever is seeded into `hand_ranks` from this catalog is what runs. **Consequence:** because mid/low ranks key on club career history, the game is only meaningful when players have rich, accurate `player_clubs` rows; thin club history collapses most hands to "no rank."

### 5.2 The Rule DSL (`hand_ranks.rule` jsonb; validated by Zod `ruleSchema`)

```jsonc
{ "type":"group", "attribute":"nationality"|"position"|"club", "min":N, "match":"shared"|"identical" }
//   shared (default): single-valued attrs ⇒ same value; club ⇒ ≥1 shared club
//   identical: CLUB ONLY ⇒ an exactly-matching full club SET
{ "type":"coverage", "attribute":"position", "values":"all" }   // GK+DEF+MID+FWD
{ "type":"anyOf", "rules":[ ... ] }                             // OR
{ "type":"allOf", "disjoint":true|false, "rules":[ ... ] }      // AND; disjoint ⇒ each sub-rule needs its OWN cards
```

Limits: `attribute` ∈ {nationality, position, club}; `coverage` applies to `position` only; `match:"identical"` applies to `club` only.

**How it evaluates (`evaluate.ts`):** the whole engine reduces to "does a rule have a **witness** in the pool?" — a minimal set of cards satisfying it (honoring disjointness). Witnesses are enumerated lazily with generators, short-circuiting on the first. A parallel "explained" traversal yields the same witnesses tagged with attribute + shared value + cards, used to build the data-driven "WHY you won" evidence shown at the result.

**Public engine API (`engine.ts` / `index.ts` exports):** `parseRule(raw)`, `achievableRanks(pool, ranks)`, `bestAchievableRank(pool, ranks)`, `validateClaim(pool, id, ranks)` → `{ isValid, bestPossibleRankId }` (a wrong claim LOSES even if a stronger rank exists), `resolveByStrength(validClaims)` (highest claimed strength wins; ties split). Also exported: `computeFold`/`FoldAccounting` (`fold.ts`), `buildSidePots`/`totalPot`/`SidePot` (`pots.ts`), `resolveShowdown`/`netBySeat`/`Settlement` (`resolve.ts`), plus betting helpers (`betting.ts`).

### 5.3 Round / betting lifecycle

Phases (`GamePhase`): `LOBBY → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → RESOLVE → ENDED`. Community reveal: FLOP=3, TURN=4, RIVER=5.

**Defaults (`DEFAULT_GAME_CONFIG`, `packages/shared/src/constants.ts`; per-room overrides in `games.config`):**
`ante = 50`, `minRaise = 50`, **`turnTimerSec = 30`**, `claimTimerSec = 60`, `handSize = 5`, `allInMode = "side_pots"`, `nextHandDelaySec = 5`, `resolveMode = "MANUAL"`.

> Divergence: `CLAUDE.md`/`MASTER FILE.txt` state "all timers 60s," but the live code default is **`turnTimerSec = 30`** (claim timer is still 60s). Report the code value.

Lifecycle (`apps/game-server/src/room.ts`, `GameRoom`):
- **START (host):** every present player must afford the mandatory ante or start is refused. Dealer button starts at the lowest occupied seat; rotates each hand.
- **DEAL:** reset per-hand state → draw cards → persist the deal → **post antes** → emit `hand:started` (carrying post-ante betting state) → privately deliver hole cards → open PREFLOP.
- **ANTE (decision 19.10):** mandatory opening bet posted by every participant at PREFLOP start; debited via the ledger. No round starts without it.
- **FIRST TO ACT (19.9):** the seat after the dealer button.
- **ACTIONS:** CHECK, CALL, RAISE (raise-to total), FOLD, ALLIN. Server validates turn + legality (engine `legalActions`/`applyAction`). A raise reopens the round. A timer advances **immediately** once a player acts (19.2).
- **TIMERS:** per-turn timer; on timeout auto-CHECK if legal else auto-FOLD. A 60s claim timer runs at showdown (MANUAL).
- **ADVANCE:** round complete → next street; only one non-folder left → hand ends (last-standing).
- **NEXT HAND:** the room does **not** auto-deal in the older sense — between hands there is a server-authoritative **ready check** (see §5.6). Host triggers / players ready-up; only then are antes charged again.

### 5.4 Fold accounting (decision 19.3, `fold.ts`)

A folder loses only a forfeit; the rest of what they committed is refunded immediately (a REFUND ledger row). PREFLOP/FLOP: forfeit = half the ante. TURN/RIVER: forfeit = half the player's last bet. The forfeit stays in the pot; refund = `committedTotal − forfeit`. Integer (BigInt) math, halves floor (ante 50 → forfeit 25). Never forfeits more than is actually in the pot.

### 5.5 Showdown & resolution (decisions 19.5–19.7, `resolve.ts` + `room.ts`)

- **Last active player standing (19.7):** wins the pot automatically, no association choice, no reveal of others.
- **MANUAL mode:** server emits `showdown:start` with all active ranks (`id`, `code`, `name_ar`, `strength`). Each contender self-declares; the engine validates (wrong claim is invalid and loses). 60s claim timer; a contender who never chooses is NOT a winner (19.6).
- **AUTO mode:** server auto-evaluates each contender's strongest actual rank with the same evaluator and resolves immediately — no declaration, no claim UI/timer. **Quick Play tables are always AUTO.**
- **Winner:** highest claimed (MANUAL) / actual (AUTO) strength wins; ties split (SPLIT_WIN); indivisible remainder coins go to the lowest-seat winner.
- **Official reveal (SPEC §2.4):** only at a real showdown do remaining contenders' hole cards become public. Folders are never revealed.
- **Private per-seat reveal (MANUAL only):** each dealt player privately receives their own strongest achievable rank (`result:best`) for the winner screen — display only.

### 5.6 All-in & side pots (19.5, `pots.ts`)

Layered side pots. `buildSidePots()` builds pots from each seat's standing contribution: each ascending distinct contribution level among non-folders opens a layer; only non-folders are eligible to win a pot; folder forfeits drop into the MAIN (lowest) pot as a pure sink. `resolveShowdown()` distributes each pot to the highest-strength eligible valid claimant; a pot with no eligible valid winner REFUNDs its layer contributions and surfaces any parked forfeit as a `FOLD_FORFEIT` sink.

### 5.7 No-winner case (19.4)

Non-folders get their full contribution refunded; folders' forfeited shares leave the economy as `FOLD_FORFEIT`. Invariant: `Σ(coins_delta) = −Σ(FOLD_FORFEIT)` — the forfeit is the only economic sink (for **human-only** games; see bots, §11).

### 5.8 Difficulty tiers (dealing pool — display only, never affects ranks)

`Difficulty` ∈ {EASY, MEDIUM, ELITE}. Filters which players are eligible to be dealt, by `floor(fame_score)` (`DIFFICULTY_MIN_SCORE` in `enums.ts`): **EASY ≥ 70, MEDIUM ≥ 50, ELITE = 0** (every active player). Floors are cumulative (EASY ⊂ MEDIUM ⊂ ELITE). The deck is built in `cards.ts` via a raw SQL filter on `floor(fame_score)`. (An older "VERY_EASY" tier was merged into EASY — see the migration.) If too few eligible players exist for the table size, the deal **throws** (see §10).

### 5.9 Fame / Legend / Tier scoring (display + difficulty only — NOT the rank engine)

Computed offline by `packages/db/prisma/calculate-scores.ts` (`pnpm db:calculate-scores`). Never touches the rank engine, wallet, or card privacy.

- **`fame_score` (0–100, every active player):** six weighted components, each normalized against **Messi** as the sole benchmark — top-5 seasons 20%, club strength 20% (Σ over distinct clubs: elite 10 / other 1), big-tournament seasons 20% (WC×8 + Euro/Copa×5 + UCL×3), national-team tier 20% (10/7/4/0), distinct clubs 10%, legend 10% (**0 for everyone — reserved**). Per component: `0.99 × min(1, raw/messi_raw) × weight`, so meeting/exceeding Messi sits 1% below him (normalized max 0.99×90 = 89.1). **Fixed exceptions:** Messi pinned to 100; Cristiano Ronaldo = 99 (override only, never a benchmark). Missing inputs → 0. (This replaced the old C1–C5 formula and the Saudi +30 bonus, both removed.)
- **`legend_score` (only players flagged `is_legend`):** base score mapped into [80, 95] via `80 + 15×(fame_score/100)`; Messi=100/Ronaldo=99 stay above the band. Non-legends NULL. Legends flagged **manually only** (never auto-promoted).
- **Effective in-game card score = `COALESCE(legend_score, fame_score)`** — the dealt player card (`apps/game-server/src/cards.ts`) shows the legend score for legends, the base score for everyone else.
- **`tier` (1–4)** derived from the fame_score ranking; drives nothing in the rank engine (the difficulty deal filter uses `fame_score` directly).

### 5.10 Stats / XP / badges (4-layer, written off the betting hot path)

During a hand, `GameRoom` buffers lightweight Layer-1 events **in memory** (zero added I/O while betting). At RESOLVE it flushes them plus one `ROUND_SUMMARY` per dealt player, then runs aggregation once (`packages/db/src/metrics.ts`): Layer 1 `play_events` → Layer 2 `player_metrics` (advanced past `last_seq`) → Layer 3 `badges` (rule jsonb evaluated against a derived MetricView; idempotent grants) → Layer 4 xp/level (`xp` from wins + profit + badges + matches; `level = floor(sqrt(xp/50)) + 1`). Aggregation is fully guarded — a stats failure never affects the game. Seeded badges (`BADGE_CATALOG`): BLUFFER 🎭, LUCKY 🍀, ROCK 🪨, GAMBLER 🎲, FOX 🦊 (each gated by a minimum match count).

### 5.11 Quick Play bots (data-driven AI fillers, behind `BOTS_ENABLED`)

See §11 for the full description (architecture, identities, ledger isolation, and the known leak). The decision engine `bots/strategy.ts` is a pure `decide()` reusing the engine evaluator (`bestAchievableRank` via hand strength) with 4 personalities (conservative/aggressive/tricky/balanced) and per-identity jitter from `player_number`.

---

## 6. Real-time layer (`apps/game-server`, Socket.IO)

Contracts live in `packages/shared/src/ws.ts` (CLIENT_EVENTS, SERVER_EVENTS, Zod input schemas, typed payloads). Client: `apps/web/src/lib/realtime.ts` (typed `socket.io-client`) + `useGameSocket.ts` (folds events into one view model) + `tableView.ts` (pure selectors). Server wiring: `apps/game-server/src/socket.ts`.

Coin amounts cross the wire as JS **numbers** (balances are small); the server converts to/from BigInt at the boundary. **Hole cards never appear in any broadcast** — only in the private per-seat `game:dealt` / `result:best` emits.

**Architectural seam:** the `GameRoom` orchestrator depends on **ports** (interfaces in `ports.ts`): `CardSource`, `RoomPersistence`, `Emitter`, `TimerService`, `Clock` (+ the optional `bots` seam). Real impls do I/O (Prisma, Socket.IO, Node timers); tests inject fakes — this is what makes the full hand flow testable without a DB or sockets.

### 6.1 Client → server events (each Zod-validated)

| Event | Payload | Purpose |
|---|---|---|
| `room:join` | `{ inviteCode, password? }` | join/rejoin a room |
| `room:leave` | `{}` | leave (host transfers if needed) |
| `room:close` | `{}` | host closes the table (void + refund) |
| `game:start` | `{}` | host starts the first hand |
| `hand:next` | `{}` | deal the next hand (no silent auto-deal) |
| `action:place` | `{ type, amount? }` | CHECK/CALL/RAISE/FOLD/ALLIN (ANTE is server-posted, never client-sent) |
| `claim:select` | `{ handRankId }` | showdown self-declaration (MANUAL) |
| `queue:join` | `{ difficulty }` | Quick Play: join a tier queue |
| `queue:leave` | `{}` | Quick Play: leave the queue |

### 6.2 Server → client events

| Event | Notes |
|---|---|
| `state:sync` | Sanitized room snapshot (**no hole cards**): yourSeat, hostSeat, players, community, pot/pots, currentBet, dealer, currentTurnSeat, turnDeadlineTs, status, phase |
| `hand:started` | New hand began (rotated dealer, reset+post-ante players) |
| `game:dealt` | **PRIVATE per-seat:** your 2 hole cards |
| `phase:changed` | New street + revealed community cards |
| `turn:changed` | `{ seat, deadlineTs }` whose turn + deadline |
| `bet:placed` | `{ seat, action, amount, pot, pots, currentBet }` |
| `player:folded` | `{ seat }` |
| `showdown:start` | `{ availableHandRanks[9], deadlineTs }` (MANUAL only) |
| `claim:received` | `{ seat }` — an opponent has chosen |
| `game:result` | Per-seat outcomes + the data-driven claim evidence (the WHY), winning association name, revealed hole cards for showdown contenders |
| `result:best` | **PRIVATE per-seat:** your own strongest achievable rank + evidence (winner screen; MANUAL only) |
| `session:waiting` | Room idle (<2 players can afford the ante) |
| `player:left` | `{ seat, username }` opponent-left banner |
| `room:closed` | `{ reason: CLOSED_BY_HOST | EMPTY }` |
| `queue:state` | Quick Play waiting-lobby (count, min, max, deadlineTs) |
| `queue:matched` | `{ gameId, inviteCode }` — go to the auto-created table |
| `error` | `{ code, messageAr }` localized error |

The client also drives sound effects off the same server events via separate listeners (`realtime.ts`), decoupled from the React view handlers.

### 6.3 Quick Play matchmaking (`matchmaking.ts`)

Server-authoritative, in-memory (safe because the game-server is single-instance). One FIFO queue per difficulty tier. Config (`QUICK_PLAY` in `constants.ts`): `minPlayers 3`, `maxSeats 6`, `fillWindowSec 20`, `startGraceSec 4`, `resolveMode AUTO`, `entryByTier { EASY:50, MEDIUM:100, ELITE:200 }` (the table's fixed ante per tier — no separate buy-in; nothing charged while queued; leaving costs nothing). Plus the bot cold-start fill window: `botFillWindowSec 8`, `botFillMin 4`, `botFillMax 6`.

Flow: join a tier queue (gated only on affording that tier's ante) → queue hits `maxSeats` → starts instantly; else once ≥ `minPlayers`, a fill window is armed and it starts when it elapses → a private QUICK_PLAY `Game` row is created (first queued player is host) → matched sockets get `queue:matched` (gameId + inviteCode) → after a short grace the server deals hand 1. Quick Play rooms are **never listed publicly** and **cannot be rejoined** once a player leaves.

### 6.4 Room types & lifecycle

`games.kind` (`GameKind`) is the **authoritative** room-type flag — never inferred from `is_private` or the name:
- **MANUAL** — created via "create room"; publicly listed (`GET /api/rooms`, kind=MANUAL & status=LOBBY); rejoinable while open. Private (password) MANUAL rooms appear flagged `locked` (invite code not exposed; password verified server-side at the table).
- **QUICK_PLAY** — matchmaking-only; never listed; never rejoinable after leaving.

Room status (`GameStatus`): `LOBBY → IN_PROGRESS → ENDED` (transient, between hands of a still-live session) / `ABANDONED` (terminal — closed for good, never resurrected). **ENDED is between-hands, NOT terminal; only ABANDONED is terminal.**

**Host authority:** starts as creator; if the host leaves without closing, authority transfers to the lowest-seat still-connected player. Host starts the game, deals the next hand, and can close the table.

**Closing / cleanup (`room.ts close()` + `socket.ts closeAndTeardown()`):** host "Close Table" or auto-cleanup when the room empties. Any live hand is **voided, not resolved**: every contributor's still-committed stake is refunded (committedTotal for non-folders, the remaining forfeit for folders), summing exactly to the pot → nets to zero, no winner, no sink. Refunds + the ABANDONED flip commit in one DB transaction; latched + idempotent so a host-close racing the empty-room cleanup runs the money path exactly once.

**Crash recovery (`recovery.ts`, at boot before serving):** in-memory round state is lost on restart, so any DB game still IN_PROGRESS is orphaned (antes/bets debited but never credited back). At startup every IN_PROGRESS game is reconciled: the wallet ledger is read chronologically, the unresolved hand's commitments (everything after the last `:resolve:` row) are refunded, and the game is marked ABANDONED. Idempotent and safe on every boot.

---

## 7. Web app (`apps/web`)

Next.js 15 App Router. Pages (under `src/app/`): `login`, `register`, `rooms` (list), `create-room`, `quick-play`, `table/[gameId]`, `bank`, `profile`, `stats`, `friends`, `rank`, `guide`. REST API routes (under `src/app/api/`):

- `auth/[...nextauth]`, `auth/logout`, `auth/register`
- `bank/claim`
- `install-reward/claim` (one-time PWA install reward, 10,000 Coins)
- `level-up/ack` (acknowledge the level-up celebration)
- `profile/me`, `profile/p/[playerNumber]`, `profile/avatar/[userId]`, `profile/avatar/by-number/[playerNumber]`
- `rooms` (create/list)
- `social/like`, `social/friend`, `social/friend/respond`
- `stats/me`

**How the browser talks to the game server:** opening `/table/[gameId]` runs a server component that verifies the Auth.js session and mints a short-lived signed **realtime token** (`lib/realtime-token.ts`; jose HS256, TTL 12h, signed with `AUTH_SECRET`). The browser never sends a raw `userId`; it connects Socket.IO to `NEXT_PUBLIC_GAME_SERVER_URL` with the token in the handshake. The game server verifies it (`src/auth.ts`) and takes identity **only** from the verified claims. Events fold into the table view via `useGameSocket.ts` + pure selectors in `tableView.ts`. The web app never evaluates bets/turns/winners/hands/balances — that is 100% server-side.

**UI flow:** register (1000 Coins) → login → create a room (or join by invite code, or Quick Play) → live RTL table (seats, community cards, action bar, claim picker at showdown, winner/result screen with the data-driven "why") → between-hands ready check → next hand. Bank top-up, profile (editable nickname, uploaded avatar, badges, stats), friends/likes, and a "guide" page round it out.

---

## 8. Infrastructure & deployment

### 8.1 Topology (Railway — one GitHub repo → three services)

```
Railway project
├─ Service "link-up"             → apps/web         (Next.js)    → poker.fmgtech.dev    (Cloudflare proxied/orange)
├─ Service "game-server-link-up" → apps/game-server (Socket.IO)  → poker-rt.fmgtech.dev (Cloudflare DNS-only/grey)
└─ Plugin  "Postgres"            → Railway PostgreSQL
```

> **Service names (renamed 2026-06-24):** the Railway services are **link-up** (`apps/web`) and **game-server-link-up** (`apps/game-server`); project **Football-B**; **Postgres** unchanged. App directories + `@fb/*` package names are unchanged — only the Railway service labels changed; `${{ ... }}` cross-service refs must use these service names.

Builder: **NIXPACKS** (`railway.toml [build]`). `[deploy]`: `restartPolicyType = ON_FAILURE`, `restartPolicyMaxRetries = 10`, **`numReplicas = 1`**. Railway does **not** create multiple services from one config file — each service is created in the dashboard pointing at the same repo, with Root Directory = repo root (so the pnpm workspace installs once and the root `postinstall` runs `prisma generate` for both).

- **link-up service (apps/web):** Build `pnpm --filter @fb/web build`; Start `pnpm --filter @fb/web start`; replicas may scale (stateless). Vars: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_GAME_SERVER_URL` (baked at **build** time).
- **game-server-link-up service (apps/game-server):** Build (none — `tsx` runs the TS source); Start `pnpm --filter @fb/game-server start` (→ `tsx src/index.ts`); **replicas = EXACTLY 1** (in-memory room state + timers). Vars: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `WEB_ORIGIN`, and (operationally) `BOTS_ENABLED`. **Do not set `PORT`** (Railway injects it; the server binds `process.env.PORT` with a local fallback).

`AUTH_SECRET` **must be byte-identical** across link-up and game-server-link-up, or every socket handshake is rejected.

**Cloudflare DNS (SSL/TLS = Full(strict)):** `poker` CNAME → link-up (proxied/orange); `poker-rt` CNAME → game-server-link-up (**DNS-only/grey**, so the browser WebSocket hits Railway's TLS endpoint directly, avoiding the Cloudflare WS proxy on day one).

> Domain note: the docs predominantly use `poker.fmgtech.dev` / `poker-rt.fmgtech.dev`. `MASTER FILE.txt` §18.6 mentions Quick Play running on **`game1.fmgtech.dev`** for the game server in one spot — a likely doc inconsistency; the canonical/most-referenced realtime host in `DEPLOY.md` + `railway.toml` is `poker-rt.fmgtech.dev`. The exact current live mapping beyond these references is **Not verifiable from the codebase** (DNS lives in Cloudflare).

### 8.2 GitHub & branch

Repo `https://github.com/fahadv2sa/link-up.git`; the production **deploy branch is `feat/fame-score-system`** (current local branch). **`git push` to that branch IS the prod deploy** (Railway auto-deploys on push). Latest local commit at summary time: `f52a858 Fix winner screen: rename poker-looking bot + show every winner's own cards`.

### 8.3 Environment variables (names + purpose only — no secret values)

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | db, web, game-server | PostgreSQL connection (runtime, pooled). |
| `DIRECT_URL` | db (migrate), web, game-server | Prisma **Migrate** connection. On Railway PG = same string as `DATABASE_URL`; locally set = `DATABASE_URL`. Runtime uses `DATABASE_URL` only. The split exists so a future move to Neon (pooled vs direct) needs no code change. |
| `AUTH_SECRET` | web **and** game-server | Auth.js JWT/cookie signing + realtime-token sign/verify. **Must be identical in both.** |
| `AUTH_URL` | web | Base URL (e.g. `https://poker.fmgtech.dev`). |
| `NEXT_PUBLIC_GAME_SERVER_URL` | web | Socket.IO URL the browser connects to. **Baked in at build time.** |
| `GAME_SERVER_PORT` / `PORT` | game-server | Listen port (local `GAME_SERVER_PORT`; Railway injects `PORT` — do not set it). |
| `WEB_ORIGIN` | game-server | Allowed CORS origin (must equal the web origin exactly). |
| `TEST_DATABASE_URL` | db (optional) | Throwaway DB for the wallet/bank test suites. |
| `API_FOOTBALL_KEY` | db (script only) | API-Football key for the one-time importer (`pnpm db:import-api-football`). Put the real key in `packages/db/.env` (gitignored); never commit. |
| `BOTS_ENABLED` | game-server | `"true"` enables Quick Play bots; unset/`false` = base game. Kill-switch. |
| `NODE_OPTIONS=--use-system-ca` | local / scripts | Required on corporate/TLS-intercepting networks so Node trusts the OS root CA (keeps TLS verification ON). |

**`DATABASE_PUBLIC_URL` vs private `RAILWAY_PRIVATE_DOMAIN`:** Railway exposes both a **public** proxy connection string (host `*.proxy.rlwy.net`, sometimes surfaced as `DATABASE_PUBLIC_URL`) and an **internal/private** domain (`RAILWAY_PRIVATE_DOMAIN`, the in-project network host) for service-to-service traffic. Per `packages/db/scripts/README.md`, **ops scripts run from a developer machine must use the PUBLIC connection string** (`*.proxy.rlwy.net`), not the internal one (the private domain is only reachable from inside Railway's network). Services deployed inside Railway can use the private host for lower latency/no egress. The repo's own `.env.example` files and `DEPLOY.md` refer to a single Railway connection string for both `DATABASE_URL` and `DIRECT_URL`; the explicit `DATABASE_PUBLIC_URL` / `RAILWAY_PRIVATE_DOMAIN` variable names are Railway-provided conventions and are **not hardcoded in the repo** beyond the public-vs-internal guidance in the scripts README.

### 8.4 External integrations & import/seed scripts

- **API-Football (api-sports.io)** — the source for player/club/nationality/tournament data, consumed **only** by one-time importer scripts (needs `API_FOOTBALL_KEY`; `players.external_ref` = the API id and the importer idempotency key). Not used by runtime gameplay.
- **Anthropic SDK (`@anthropic-ai/sdk`)** — used **only** by `transliterate-names.ts` to fill `players.name_ar` (offline). Not used by runtime gameplay.

Scripts (run via `pnpm db:*`, from `packages/db`):

| Script | Action |
|---|---|
| `db:seed` (`prisma/seed.ts`) | Seeds the 4 Positions + 9 HandRanks + the Badges (idempotent). |
| `db:seed-players` (`prisma/seed-players.ts`) | Optional player seeding helper. |
| `db:import-api-football` (`prisma/import-api-football.ts`) | One-time importer of players/clubs/nationalities from API-Football. |
| `db:import-tournament-stats` (`prisma/import-tournament-stats.ts`) | Per-player tournament appearance counts. |
| `db:diff-import` (`prisma/differential-import.ts`) | Differential/incremental import. |
| `db:transliterate-names` (`prisma/transliterate-names.ts`) | Fills `players.name_ar` (uses `@anthropic-ai/sdk`). |
| `db:calculate-scores` (`prisma/calculate-scores.ts`) | Computes `fame_score` / `tier` / `legend_score`. |
| `db:seed-bots` (`apps/game-server/src/bots/seed-bots.ts`) | Seeds Quick Play bot identities (sharp-downscaled webp avatars; idempotent). |
| Ops/one-off (not in the table) | `prisma/sync-scores-to-prod.ts`, `prisma/topup-wallets.ts`, `prisma/backfill-fixes.ts`, `prisma/_ensure-system-ca.ts`, `scripts/abandon-game.ts`, `scripts/grant-bonus.ts`. |

**First-time prod data setup (`DEPLOY.md` STEP 4–5):** `db:deploy` + `db:seed` against the prod URL, then import the player tables from the local Docker DB (avoids re-spending API quota). **STEP 5b is REQUIRED:** remap `players.position_id` by position `code`, because positions are *seeded* on prod (different UUIDs) while imported players still point at local position UUIDs — otherwise every `player.position` resolves to null and the game crashes. `nationalities`/`clubs` are imported wholesale so their UUIDs match; only positions need the remap.

---

## 9. Authentication & security

- **Auth:** Auth.js (next-auth v5 beta) Credentials provider; username + password; JWT session strategy in an httpOnly cookie. Passwords hashed with **argon2id** (`@node-rs/argon2`). Config: `apps/web/src/auth.ts`. Username rules (`auth.schemas.ts`): 3–24 chars `[a-zA-Z0-9_]`; password 8–128.
- **Realtime token:** minted server-side only (`lib/realtime-token.ts`) from the verified session, signed HS256 with `AUTH_SECRET`, TTL 12h. The game-server verifies it (`src/auth.ts`) and takes identity only from verified claims. Expired token → `SESSION_EXPIRED` (client can refresh); otherwise `UNAUTHENTICATED`.
- **Inactivity auto-logout:** a single threshold `SESSION_INACTIVITY_MS = 2 days` is used both as the rolling Auth.js JWT `maxAge` (web) and as the window the game-server checks `users.last_active_at` against at the Socket.IO handshake. Activity writes are coalesced (`ACTIVITY_WRITE_THROTTLE_MS = 10 min`). Bots are exempt.
- **Game-server middlewares (before handlers):** (1) per-IP connection rate limiter (30/min) to throttle brute-force/bad-token attempts before auth; (2) token verification.
- **Room passwords:** argon2id-hashed, verified server-side on join (new members only; rejoining members and Quick Play skip it). Invite codes are unguessable random base64url; private rooms never expose their invite code in the public list.
- **Card privacy:** hole cards live only in server memory + the owner's private emits; never in any broadcast (verified by tests + the audit trace).
- **Validation:** all client inputs validated with Zod (every socket event + every REST body).
- The rate limiter is in-memory per process (adequate for single-server v1; needs Redis to scale out).

### Wallet ledger integrity (critical — `packages/db/src/wallet.ts` + `bank.ts`)

- `wallet_transactions` is the **financial source of truth**; `wallets.balance` is a cache, mutated only in the same DB transaction as a ledger insert.
- Every movement: open tx → `SELECT … FOR UPDATE` the wallet row (serializes concurrent movements per user) → check sufficiency (`balance + amount >= 0`) → insert a ledger row with a **unique `reference`** → update balance/highest_balance → commit. Any failure → full rollback.
- **Idempotency:** each action carries a server-generated unique `reference` (= actionId), derived from authoritative server state (gameId + seat + a monotonic server action seq), never from client input. Per-hand references are salted with the hand number. Replaying the same reference is a no-op.
- Balance never negative (code + DB CHECK `wallets_balance_nonneg`).
- **Composability:** `applyWalletTransaction(tx, params)` runs inside a caller-provided transaction so the game-server can chain several movements + Bet/Result/Stats writes atomically (`persistence.ts`: `applyBetting`/`persistResolve`/`closeGame`). `applyWalletTransactionAtomic()` wraps a single movement in its own tx.
- **Registration:** `registerUserWithWallet()` creates user + empty Wallet (0) + UserStats and credits the 1000 SIGNUP_BONUS through the ledger in one transaction (so `balance == Σ(ledger)` from the first row).
- **Bank:** `claimFromBank()` locks the wallet row, counts claims in the window inside the lock (race-free), records a BankClaim, credits via the ledger — one transaction.
- **Reference naming conventions (do not break — crash recovery's positional last-resolve split depends on them):** `:ante:`, `:act:`, `:foldrefund:`, `:resolve:`, `:abortrefund:`, `:recovery:refund:`.

---

## 10. Coins economy & money rules

- Signup grants **1000 Coins** (`SIGNUP_BONUS = 1000n`).
- **Bank top-up.** `MASTER FILE.txt`/`CLAUDE.md` describe "max 2 claims per rolling 24h." The **current code has evolved** to a **level-scaled once-per-day** claim (`constants.ts`): a player may claim **once per day** for `level × BANK_CLAIM_PER_LEVEL` coins (`BANK_CLAIM_PER_LEVEL = 1000n` → level 1 = 1000, level 2 = 2000, …), with the "day" anchored to **Asia/Riyadh (UTC+3, no DST)** (`BANK_RESET_TZ_OFFSET_HOURS = 3`). The legacy `BANK_CLAIM_MAX_PER_WINDOW = 2` / `BANK_CLAIM_WINDOW_HOURS = 24` constants are retained but marked superseded. `bank_claims` now logs `level` + `balance_after`.
- **One-time install reward:** `INSTALL_REWARD_AMOUNT = 10000n`, granted exactly once per account after a real PWA install (`install_reward_at` + `INSTALL_REWARD` ledger type).
- No buy/sell/transfer of Coins. No card ownership/inventory/shop/collection. Cards dealt randomly per hand. Rooms are temporary; persistent data = users, wallets, ledger, stats, results, football reference data.
- **Movement types (`WalletTxType`):** SIGNUP_BONUS, BANK_CLAIM, ANTE, BET, RAISE, ALLIN, WIN, SPLIT_WIN, REFUND, FOLD_FORFEIT, INSTALL_REWARD.
- **Invariant:** for a human-only session, `Σ(coins_delta) = −Σ(FOLD_FORFEIT)`. (Does **not** hold for bot-containing games — see §11.)

---

## 11. Quick Play bots (cold-start fillers — behind `BOTS_ENABLED`)

Temporary, cleanly-removable AI fillers so early users always find a Quick Play game. **Quick Play ONLY** (never manual rooms). All under `apps/game-server/src/bots/`.

- **Decision engine + identity pool.** `bots/strategy.ts` = pure `decide()` reusing the engine evaluator; 4 personalities (conservative/aggressive/tricky/balanced) with per-identity jitter from `player_number`; bluffs; strong hands never fold; only legal actions. `bots/controller.ts` drives a bot's turn via the optional `RoomDeps.bots` seam (`room.ts beginTurnOrAdvance → deps.bots?.onTurn`) with human-like delays (~0.7–7s, clamped before the turn deadline, race-safe). `bots/{pool,seating,runtime}.ts` manage identities + fill.
- **Identities = "Model B".** Real `users` rows in the reserved `player_number` block **≥ 900000** (`BOT_PLAYER_NUMBER_BASE` in `@fb/shared`; `isBotPlayerNumber()`). No schema column, no migration — the web resolves bot name/avatar/profile via the normal by-number endpoints. Each has a fabricated `player_metrics` row + a webp avatar in `user_avatars`; **NO wallet, NO user_stats**. Seeded by `bots/seed-bots.ts` (`pnpm db:seed-bots`) from `bots/identities.json` (committed) + `bots/avatars/` (85MB sources gitignored; sharp downscale to ≤256×256 webp; game-logo fallback; idempotent). **46 identities seeded** (local + prod), reserved block 900001…900046; fills toward 100 later.
- **Cold-start fill.** `QUICK_PLAY.botFillWindowSec = 8`: when ≥1 human queues but below `minPlayers` (3), an 8s window then fills to a randomized 4–6 seats (`matchmaking.ts` + `socket.ts startTable → bots.fill`). Healthy all-human tables get no bots. If 0 humans joined by deal time, the table is torn down.
- **Ledger/stats isolation (critical).** A bot seat **never** writes `wallet_transactions`, `game_players`, `bets`, `GameResults`, `UserStats`, or `play_events` (enforced in `room.ts` + `persistence.ts`). Bots play a fake in-memory stack (`BOT_VIRTUAL_STACK`). A human winner is credited the **full pot** (incl. bots' fake antes) — a real **mint** — via the normal idempotent ledger; a bot beating a human **burns** the human's real coins. ⇒ the per-game invariant `Σ(delta) = −Σ(FOLD_FORFEIT)` **does not hold** for bot games (scope any ledger-sum check to human-only). Crash recovery is unaffected (bots never wrote ledger rows). Verified on prod: 0 bot wallets, 0 bot game_players.
- **Social fencing.** `player_number ≥ 900000` can't be liked/friended (`apps/web/src/app/api/social/*`) — generic 403, never reveals "bot". Profiles stay viewable.
- **Flag + kill-switch.** `BOTS_ENABLED=true` on the game-server enables it (boot log `[bots] enabled — N identities loaded`); unset/`false` = byte-for-byte base game (`[bots] disabled`). Read in `index.ts`. **Kill-switch:** set `BOTS_ENABLED=false` in Railway → restart. **Prod state (per docs):** code deployed (commit `5e54d85`), 46 bots seeded, `BOTS_ENABLED=true` set by the operator.
- **Remove entirely:** delete `apps/game-server/src/bots/`, the `deps.bots?` seam + call in `room.ts`, the social fence + `isBot` guards, and `DELETE FROM users WHERE player_number >= 900000`.

---

## 12. Current state — built vs. in progress

**Built and working (per `README.md` + `MASTER FILE.txt`, all SPEC §20 phases implemented):**
- Foundation — monorepo, Prisma schema + migrations, seed (Positions + HandRanks + Badges), Auth.js (Credentials, argon2id), Wallet/UserStats + 1000 signup bonus, wallet-integrity tests.
- Hand Engine — pure, data-driven interpreter of the 9 association ranks (+ betting/pots/fold/resolve).
- Game Server — Socket.IO authoritative state machine, turn/claim timers, side pots, DB transactions, Quick Play matchmaking, crash recovery.
- Frontend — Next 15 + Tailwind v4 + shadcn/ui + framer-motion premium RTL UI; live table; claim picker; winner screen.
- Bank / Profile / Stats — bank top-up (now level-scaled daily), profile (editable nickname, uploaded avatar), statistics + achievements/badges, the 4-layer stats system, fame/legend/tier scoring.
- Polish — premium table UI, rate limiting, ESLint flat config, fonts via `next/font`, sounds, social layer (likes/friends), install reward, level-up celebration, inactivity auto-logout.
- Deployed to Railway (3 services) with Cloudflare DNS; prod DB migrated + seeded + player data imported; 46 Quick Play bots seeded with `BOTS_ENABLED=true`.

**In progress / reserved / not yet implemented:**
- The fame-score **legend component is reserved** (0 for everyone — scoring rule not yet activated).
- `player_tournament_stats` is intentionally empty until the tournament-stats import is run on a given DB.
- Bot pool fills **toward 100** identities over time (currently 46).
- A **release/predeploy `prisma migrate deploy`** safeguard is recommended but **not yet added** to `railway.toml` (migrations remain manual — see §13).
- Redis-backed room state / matchmaking / rate-limiter for horizontal scaling is **structured for but not implemented** (v1 is single-instance).
- No leaderboard endpoint yet (noted as a place to extend the bot social fence if added).

---

## 13. Known issues, bugs & technical debt

From `CLAUDE.md`, `MASTER FILE.txt` §16, `GAMEPLAY_AUDIT.md`, and code comments:

1. **Quick Play bot table memory/pool leak (open, not yet fixed).** When all *humans* leave a bot-containing Quick Play table, teardown is skipped because the check `players.some(p => p.connected)` (`socket.ts leave()`, ~lines 358 & 366) counts bots (seated `connected:true`, never flipped). The table doesn't keep playing (no auto-deal) but the room object, deck, and bot identities **leak in process memory** and the bot pool's in-use count grows until a game-server restart (boot recovery then marks the orphaned IN_PROGRESS game ABANDONED). **Recommended fix (one place):** count connected **humans** only — `p.connected && !p.isBot` — matching the pattern already used in `startTable`.

2. **Migrate-first deploy rule (process debt — caused a real prod outage 2026-06-21).** Railway auto-deploys code on `git push` to the deploy branch, but migrations are **manual** (no predeploy/release command in `railway.toml`). Prisma Client SELECTs columns from the **schema**, not the DB, so pushing schema-dependent code before applying the migration crashes prod (the 2026-06-21 incident: `is_legend`/`legend_score` code shipped before the prod migration; the web stayed up but every hand crashed at card dealing). **THE RULE: migrate prod first, deploy (push) second — never the reverse.** Verify a players-schema change by **starting a hand**, not by loading the login page (the web service never queries `players`). The lasting fix (a release/predeploy `prisma migrate deploy`) is **still pending**.

3. **Club-based ranks need full career data (data-fragility, by design).** PAIR/TWO_PAIR/TRIPLE/FULL_HOUSE are clubs-only in the current code (a divergence from the SPEC table). Without rich, accurate `player_clubs` rows, most hands evaluate to "no rank."

4. **Enough eligible players to deal.** A hand needs `seats × 2 + 5` distinct **eligible** players for the room's difficulty: 2p=9, 3p=11, 4p=13, 5p=15, 6p=17 (EASY/MEDIUM restrict the pool by `fame_score`, so they need even more). `cards.ts` throws "Not enough eligible players …" otherwise and the hand never starts. (Historically only ~10 players were seeded, so 3+ player tables couldn't deal — see audit finding F.)

5. **Single game-server instance (architectural constraint).** Room state + timers are in memory ⇒ replicas **must be 1**. Scaling horizontally would split-brain rooms. Rate limiter + matchmaking are also in-memory per process — both need a shared store (Redis) before scaling out.

6. **`AUTH_SECRET` must match / `WEB_ORIGIN` must be exact**, or sockets are rejected / the browser hits CORS.

7. **`GAMEPLAY_AUDIT.md` is dated 2026-06-17 and partly outdated.** It cataloged client-side UX gaps; several have since been addressed in code (antes now posted *before* `hand:started` with post-ante state; client resets `committedThisRound` on `phase:changed`; the room no longer silently auto-deals — a ready check/host trigger gates the next hand; reconnect re-sends private hole cards; `player:left`/`session:waiting`/`room:closed`/reconnect notices wired). Remaining possible UX polish (richer side-pot display, claim-timer visibility, whose-turn text) should be re-checked against current `apps/web/src/components/table/*`.

8. **Card amounts as numbers on the wire.** Safe because balances are small (far under `Number.MAX_SAFE_INTEGER`), but the server keeps BigInt authority — never move large-value logic to the client.

9. **Doc-vs-code divergences to be aware of** (flagged throughout this summary): rank semantics/ordering (§5.1), `turnTimerSec = 30` not 60 (§5.3), level-scaled daily bank claim vs "2×/24h" (§10), `INSTALL_REWARD` enum + several newer migrations/features not in `MASTER FILE.txt`, and the `game1.fmgtech.dev` vs `poker-rt.fmgtech.dev` mention (§8.1).

---

## 14. pnpm scripts reference

**Root (`package.json`):**

| Script | Action |
|---|---|
| `postinstall` | `pnpm --filter @fb/db generate` — regenerate the Prisma client (runs on every install/deploy; client is in a git-ignored path). |
| `build` | `turbo run build` — build all packages. |
| `dev` | `turbo run dev` — run dev tasks (persistent, uncached). |
| `lint` | `eslint .` — ESLint flat config across the monorepo. |
| `typecheck` | `turbo run typecheck` — `tsc --noEmit` everywhere. |
| `test` | `turbo run test` — all vitest suites. |
| `db:generate` | Generate the Prisma client. |
| `db:migrate` | `prisma migrate dev` — create/apply a dev migration (needs a live DB). |
| `db:deploy` | `prisma migrate deploy` — apply pending migrations (used for prod). |
| `db:seed` | Seed 4 Positions + 9 HandRanks + Badges (idempotent). |
| `db:seed-players` | Optional player seeding helper. |
| `db:import-api-football` | One-time API-Football importer. |
| `db:import-tournament-stats` | Per-player tournament appearance counts. |
| `db:diff-import` | Differential/incremental import. |
| `db:transliterate-names` | Fill `players.name_ar` (Anthropic SDK). |
| `db:calculate-scores` | Compute fame/tier/legend scores. |
| `db:reset` | `prisma migrate reset --force` — drop, re-migrate, reseed. |
| `db:seed-bots` | Seed Quick Play bot identities (game-server). |

**`@fb/web`:** `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`).

**`@fb/game-server`:** `dev` (`tsx watch --env-file=.env.local src/index.ts`), `build` (`tsc`), `start` (`tsx src/index.ts`), `typecheck`, `test` (`vitest run`), `smoke` (`vitest run -c vitest.smoke.config.ts` — full hand against a live server), `seed:bots`.

**`@fb/db`:** `generate`, `migrate:dev`, `migrate:deploy`, `migrate:reset`, `seed`, `seed:players`, `import:api-football`, `import:tournament-stats`, `diff-import`, `transliterate:names`, `calculate:scores`, `studio` (`prisma studio`), `typecheck`, `test`, `test:watch`.

**`@fb/engine`:** `typecheck`, `test`.
**`@fb/shared`:** `typecheck`, `lint` (both `tsc --noEmit`).

---

## 15. Running locally (quick reference)

Prereqs: Node ≥ 20, pnpm ≥ 9, Docker (or any reachable PostgreSQL 14+). On corporate/TLS-intercepting networks set `NODE_OPTIONS=--use-system-ca` (keeps TLS verification ON).

```bash
pnpm install
docker compose up -d                       # local PostgreSQL (postgres:16-alpine, :5432)
cp packages/db/.env.example       packages/db/.env
cp apps/web/.env.example          apps/web/.env.local
cp apps/game-server/.env.example  apps/game-server/.env.local
#  generate ONE AUTH_SECRET (npx auth secret) → SAME value in both web + game-server .env
#  locally also set DIRECT_URL = your DATABASE_URL in packages/db/.env
pnpm db:generate && pnpm db:deploy && pnpm db:seed
# 3 processes:
docker compose up                          # Postgres
pnpm --filter @fb/game-server dev          # Socket.IO :4000
pnpm --filter @fb/web dev                  # Next.js :3000
```

Open http://localhost:3000, register (1000 Coins), create a room, share the invite code. **Dealing needs players in the DB** — import/seed football players first or the deal fails (see §13.4). Quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter @fb/web build`. The wallet/bank suites hit a real PostgreSQL (start Postgres + `pnpm db:deploy`, or set `TEST_DATABASE_URL`).

---

## 16. Conventions (cheat-sheet)

- DB: snake_case via `@@map`/`@map`; all PKs `uuid`; all timestamps `timestamptz`.
- Strict TypeScript everywhere; Zod for every external input.
- Money is **BigInt** end-to-end on the server/DB; converted to Number only at the WebSocket boundary.
- The engine (`packages/engine`) stays **pure** — no I/O, DB, or clock. The wallet primitive lives in `packages/db`. The game-server composes them behind ports.
- Enums/constants/contracts have one home in `packages/shared`, mirrored by the Prisma enums — keep them in sync.
- The HandRank catalog in `@fb/shared` is the single source of truth: the seed writes it to the DB and the engine interprets the same DSL — edit there and re-seed to change behavior.
- Server-generated idempotency references follow strict naming (§9) — don't change casually (crash recovery depends on them).
- Arabic UI strings are fixed game vocabulary in code; football data (names/nationalities/clubs) is never hardcoded — always from the DB.
- The repo lives under OneDrive: if `node_modules` sync causes EPERM/file-lock issues, pause OneDrive sync for the folder or exclude `node_modules`.

---

*End of technical summary. Built from the in-repo files listed in §1; doc-vs-code divergences are flagged where the live code (the authority) differs from `CLAUDE.md`/`MASTER FILE.txt`. The original Arabic `SPEC.md` lives outside the repo (on the Desktop) and is **Not found in the codebase**.*
