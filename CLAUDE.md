# CLAUDE.md — Football Poker

Reference card for this project. Authoritative source is `SPEC.md` (on the user's Desktop:
`C:\Users\Admin\OneDrive\Desktop\SPEC.md`), Arabic, "Football Poker — النسخة النهائية v3".
All decisions are finalized in **Section 19** — follow them literally, add no assumptions.

## What this is

Server-authoritative online multiplayer card game. Texas-Hold'em-style structure (rooms, blinds-like
betting, community cards, showdown), but the winning logic is based on **football knowledge** —
relationships between players by **nationality, position, and clubs**. Fully Arabic, RTL, premium dark theme.

Two critical pieces (separate, heavily-tested):
1. **Football Hand Engine** — data-driven associations engine (9 ranks, pure functions). Phase 2.
2. **Wallet / Betting Integrity** — append-only ledger, DB transactions, row locks, idempotency.

## Recent changes (2026-06-23) — read these; they supersede older text below

- **Showdown is now FULLY AUTOMATIC in every room** (manual self-declaration removed).
  The server evaluates each contender's actual strongest combination and resolves by:
  (1) strongest combination wins; (2) tie on strength → the stronger **SUM of the
  combination's player fame scores** wins outright; (3) still tied → split equally, the
  indivisible remainder to the **round starter** (dealer button), else lowest-seat winner.
  `resolveShowdown(seats, dealerSeat?)` takes per-seat `scoreSum`. The entire claim flow
  was deleted as dead code (events `showdown:start`/`claim:select`/`claim:received` + their
  schemas, the claim timer, `GameRoom.selectClaim`, web `ClaimPanel`). This makes Section 19
  #6 ("claim-timer expiry") obsolete and overrides the MANUAL `resolveMode` default.
- **Winner reveal shows EVERY dealt player** at a real showdown (winner, loser, folders) —
  each with combination, evidence, hole cards, and a "players power" sum
  (`GameResultEntry.scoreSum`). Card-privacy principle (#4 below) is intentionally waived
  **only at the official reveal**; mid-hand privacy is unchanged. Result screen has themed
  cards: winner=gold 🏆, no-winner=slate "تعادل!", loser=red (compact, tap to expand);
  distinct win/lose/showdown sounds.
- **Reconnection grace** (`RECONNECT_GRACE_MS` = 5 min). A dropped socket (e.g. backgrounding
  the tab) is no longer treated as leaving: the seat + room are held; a reconnect cancels it;
  cleanup runs only on explicit leave/close or grace expiry. Web nudges a reconnect on tab
  re-focus (`realtime.ts`). A seat disconnected mid-hand is **folded** on its turn timeout
  (never auto-checked), so a departed player can't win.
- **Idle auto-logout is now 24 hours** (`SESSION_INACTIVITY_MS`, was 2 days).

## Tech stack (Section 3)

```
Frontend:    Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + framer-motion
Game Server: Node.js + TypeScript + Socket.IO   (separate service from Next.js)
Database:    PostgreSQL + Prisma
Validation:  Zod (every input)
Auth:        Auth.js (Credentials) + httpOnly cookie, argon2id hashing
Scaling:     v1 single server (~1000 users); room state isolated for later Redis swap
Forbidden:   Firebase / NoSQL as game backbone; any sensitive logic in the browser
```

## Monorepo layout (Section 4 — pnpm workspaces + Turborepo)

```
/apps/web            → Next.js (UI + REST: auth, profile, stats, bank, rooms)
/apps/game-server    → Node + Socket.IO (authoritative engine + timers + room state)
/packages/db         → Prisma schema + migrations + seed (Positions + HandRanks only) + wallet service
/packages/engine     → Football Hand Engine + betting rules (pure, testable functions, NO I/O)
/packages/shared     → types + WebSocket event contracts (Zod) + constants + enums
```

`/packages/engine` = pure functions, no I/O. The game-server owns authoritative in-memory room state
and writes to PostgreSQL inside transactions.

## Non-negotiable principles (Section 2)

1. Server is the only referee. Browser decides nothing sensitive.
2. **Data-driven**: never hardcode any player/club/nationality. All football data lives in PostgreSQL;
   add/remove/edit without touching code. Associations are read from `HandRanks` and interpreted
   dynamically by the engine.
3. **Wallet integrity**: every Coins movement goes through an append-only ledger, inside DB transactions
   with row locks and idempotency keys.
4. **Card privacy**: a player's two hole cards are sent only to their owner; never broadcast until the
   official reveal.
5. TypeScript everywhere, Zod for every input.

## Section 19 — FINAL DECISIONS (binding)

1. **HAND_SIZE = 5** for Royals and Full-House-Club.
2. **Defaults:** `ante=50`, `minRaise=50`, all timers `60s`. A timer advances **immediately** once the
   player acts before time runs out (no waiting for the clock).
3. **Fold:** forfeits only half the Ante (on FLOP) or half the last bet (later rounds); the forfeit stays
   in the pot, the **rest of what they paid is refunded to their wallet immediately**.
4. **No winner:** non-folders get their full contribution refunded; folders' forfeited shares leave the
   economy as `FOLD_FORFEIT`.
5. **All-in:** enabled with **layered Side Pots**.
6. **Claim-timer expiry:** a player who didn't choose is NOT a winner; their contributions stay for the winner.
7. **Last active player standing:** wins the pot automatically, no association choice needed.
8. **Auth:** Auth.js (Credentials), register with username + password, session in httpOnly cookie.
9. **First to act:** the seat after the dealer button; the button rotates every round.
10. **Mandatory opening bet:** Ante paid by every player at the start of PREFLOP (always present; no round
    starts without it).

## Wallet rules (Section 6) — critical

- Financial source of truth = `WalletTransactions` (append-only). `balance` is updated ONLY in sync with
  inserting a transaction, inside the same DB transaction.
- Every op: open tx → `SELECT … FOR UPDATE` on the wallet row → check sufficiency → insert transaction
  with unique `reference` → update `balance`/`highest_balance` → commit. Any failure → rollback.
- **Idempotency**: each action carries a server-generated unique `actionId` = the `reference`. Repeating
  the same reference does not repeat the charge.
- Invariant: Σ of all `coins_delta` for a session = `-(Σ FOLD_FORFEIT)`. The only sink leaving the economy
  is the forfeit.
- Balance is never negative. Every bet is also recorded in `Bets` within the same movement path.
- Movement types: `SIGNUP_BONUS | BANK_CLAIM | ANTE | BET | RAISE | ALLIN | WIN | SPLIT_WIN | REFUND | FOLD_FORFEIT`.

## Coins economy (Section 1)

- Signup: **1000 Coins**. When the balance runs out, request 1000 more from the bank, **max twice per 24h**.
- No buy/sell/transfer of Coins. No matchmaking, ranking, or levels.
- Rooms are temporary and disappear after the session. Persistent: users, wallets, stats, results, ledger.
- No permanent card ownership: no inventory/collection/shop/rarity. Drawing is fully random within a session.

## The 9 Hand Ranks (Section 7.2) — seeded into HandRanks

| strength | code | الاسم | condition |
|---|---|---|---|
| 9 | `ROYAL_CLUB` | رويال النادي | 5 cards with an identical full club set |
| 8 | `ROYAL_NATION` | رويال الجنسية | 5 cards same nationality |
| 7 | `ROYAL_POSITION` | رويال المراكز | 5 cards same position |
| 6 | `FULL_HOUSE_CLUB` | فل هاوس كلوب | 5 cards share at least one club |
| 5 | `LINEUP` | تشكيلة | covers all four positions (GK, DEF, MID, FWD) |
| 4 | `FULL_HOUSE` | فل هاوس | (3 position + 2 nationality) or (3 nationality + 2 position), disjoint |
| 3 | `TRIPLE` | ثلاثي | 3 cards sharing nationality OR position (NOT club) |
| 2 | `TWO_PAIR` | زوجين | two disjoint pairs, each by nationality/position/club |
| 1 | `PAIR` | زوج | one pair by nationality/position/club |

Mandatory semantics: TRIPLE and FULL_HOUSE never use club. PAIR/TWO_PAIR/FULL_HOUSE_CLUB/ROYAL_CLUB use
club. ROYAL_CLUB = full club-set match; FULL_HOUSE_CLUB = one shared club is enough.

## Data seeding (Section 17)

Only ever seed: the 4 Positions + the 9 HandRanks (game rules, editable from the table). NEVER insert any
real football player — the owner supplies the player database later, data-driven.

## Build phases (Section 20)

1. **Phase 1 — Foundation** *(current)*: monorepo + full Prisma schema + migrations + seed
   (Positions + HandRanks). Auth + Wallet/UserStats init + 1000 bonus + basic Wallet tests. **STOP for review.**
2. Phase 2 — Hand Engine: `/packages/engine` + Rule DSL + 9 ranks + all unit tests.
3. Phase 3 — Game Server: Socket.IO + state machine + timers + room state + wallet ops in transactions
   + side pots + Bets/Cards/Claims/Results records + integration tests.
4. Phase 4 — Frontend: menu, create/join room, live table screen, association choice, results. RTL + premium.
5. Phase 5 — Bank/Profile/Stats: bank (2×/24h), profile, stats, achievements, auto-update.
6. Phase 6 — Polish: animations, disconnect/reconnect, rate limiting, README.

## Project location

Monorepo lives at `C:\Users\Admin\OneDrive\Desktop\poker-app` (chosen by the user). It is under OneDrive —
if `node_modules` sync ever causes file-lock/EPERM issues, pause OneDrive sync for this folder or exclude
`node_modules`. The spec lives at `C:\Users\Admin\OneDrive\Desktop\SPEC.md`.

## Fame & Legend scoring (display/difficulty only — NOT the rank engine)

`players.fame_score` / `tier` / `legend_score` are a **display + difficulty** system
(`packages/db/prisma/calculate-scores.ts`, run with `pnpm db:calculate-scores`). They
**never** touch the rank engine, wallet, or card privacy. Two tracks:

**Base track — `fame_score` (every active player), 0–100.** Six weighted components,
each **normalized against Messi** (the sole benchmark): top-5 seasons 20%, club
strength 20% (Σ over distinct clubs: elite 10 / other 1, elite list in the script),
big-tournament seasons 20% (WC×8 + Euro/Copa×5 + UCL×3), national-team tier 20%
(10/7/4/0), distinct clubs 10%, legend 10% (**0 for everyone** — reserved, not yet
activated). Per component: `0.99 × min(1, raw / messi_raw) × weight` — i.e. meeting
or exceeding Messi sits **1% below him** (smooth, continuous at ratio=1, no
discontinuity, ordering preserved), so no one reaches Messi on any component or
overall (normalized max 0.99×90 = 89.1). **Fixed exceptions:** Messi pinned to **100**
(the reference), **Cristiano Ronaldo = 99** (override only, NOT a benchmark — never
affects anyone's normalization). Missing inputs → 0. *(This replaced the old C1–C5
formula and the Saudi +30 bonus, both removed.)*

**Legend track — `legend_score` (ONLY players flagged `is_legend`).** The base score
mapped into **[80, 95]** via `80 + 15 × (fame_score / 100)`; Messi=100, Ronaldo=99 stay
fixed above the band. Non-legends get `legend_score = NULL`. Legends are flagged
**manually only** — a newly added player defaults to the base track and is never
auto-promoted. Re-running `calculate-scores` writes both and preserves the split.

**Effective score** used in-game = `COALESCE(legend_score, fame_score)`: the dealt
player card (`apps/game-server/src/cards.ts`) shows the legend score for legends and
the base score for everyone else.

## Deploy safety — schema/code ordering (READ before ANY schema change)

**This section exists because of a real prod outage (2026-06-21). Follow the rule below
and it cannot recur.**

### What happened (the incident)

The branch added two columns to `players` (`is_legend`, `legend_score`) via migrations and
shipped runtime code that reads them (`apps/game-server/src/cards.ts` →
`prisma.player.findMany`). The code was committed and **pushed**; the **prod migration was
never applied**. Railway **auto-deploys the deploy branch on push**, so the new game-server
went live querying columns the prod DB didn't have. Result: every hand crashed at card
dealing with `The column players.is_legend does not exist in the current database`. The
**web app stayed up** (it never queries the `players` table — only users/wallets/stats/
rooms), which masked the problem until someone actually started a hand.

Fix was two phases: **(1)** apply the pending migrations to prod (`pnpm db:deploy` with the
prod URL — additive `ADD COLUMN`, instant, non-destructive) → crash gone; **(2)** sync the
display columns local→prod (`packages/db/prisma/sync-scores-to-prod.ts`).

### Root cause (the trap, stated plainly)

1. **Railway auto-deploys code on push** to the deploy branch (`feat/fame-score-system`).
2. **Migrations are MANUAL** — there is **no release/predeploy command** in `railway.toml`,
   so a push deploys new code but does **not** run `prisma migrate deploy`.
3. **Prisma Client selects columns from the SCHEMA, not the DB.** Any `player.findMany`
   built from a schema that has `is_legend`/`legend_score` emits SQL naming those columns;
   if the DB lacks them, the query throws — it is NOT a silent/ignored mismatch.

So: **push schema-dependent code → prod runs it immediately → if prod isn't migrated, it
crashes.** Tests/local pass because local IS migrated.

### THE RULE (non-negotiable ordering)

> **A migration that runtime code depends on MUST be applied to prod BEFORE (or in the same
> step as) the code that reads/writes it is deployed. Migrate first, deploy second. Never
> the reverse.**

Because deploy = `git push`, "deploy second" means: **run the prod migration before you push
the code**, or push to a branch Railway does not auto-deploy until the migration is done.

### Checklist — any change that touches `schema.prisma`

Before pushing, ask: *does this change add/rename/drop a column, table, enum, or required
relation that runtime code (game-server `cards.ts`, or any `apps/**` Prisma query) reads?*
If yes:

- [ ] **Adding** a column/table the new code reads → **apply the migration to prod FIRST**
      (`NODE_OPTIONS=--use-system-ca DIRECT_URL=<prod> DATABASE_URL=<prod> pnpm db:deploy`),
      verify it applied, **then** push the code. Additive `ADD COLUMN` is safe to apply
      while the old code is still live (old code just ignores the new column).
- [ ] **Removing/renaming** a column the old code reads → do it in TWO deploys
      (expand/contract): first deploy code that no longer references it, **then** migrate to
      drop. Never drop a column the currently-deployed code still selects.
- [ ] **NOT NULL / new required relation** → migrate as nullable + backfill + only then
      enforce, across separate deploys. A bare `ADD COLUMN ... NOT NULL` with no default
      against a populated table will fail or block.
- [ ] After migrating prod, confirm: `pnpm prisma migrate status` → "up to date", and a
      sample `player.findMany({ select: { <new cols> } })` succeeds against prod.
- [ ] Remember **`git push` IS the prod deploy** (Railway, branch `feat/fame-score-system`).
      There is no separate "deploy" gate. Treat every push to that branch as going live.

### Stronger guarantee — NOW AUTOMATED (2026-06-23)

This is now in place: `railway.toml [deploy]` sets
`preDeployCommand = 'DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}" pnpm db:deploy'`, so every
deploy runs `prisma migrate deploy` against prod **before** the new process serves, and a
failed migration **aborts the deploy**. (The `DIRECT_URL := DATABASE_URL` fallback lets a
service that only sets `DATABASE_URL` — e.g. game-server — still migrate; without it the
predeploy hit Prisma P1012.) The manual checklist above remains the belt-and-suspenders
mental model, but ordering is no longer purely manual. NOTE: each Railway service must have
**auto-deploy from the branch ENABLED** (the game-server's was found OFF once, leaving it on
a stale build — use "Deploy latest commit" in the dashboard if a push doesn't auto-fire).

### Why the web app didn't crash (don't be fooled again)

A green web app does **not** mean a healthy deploy. The web service never queries `players`;
only the **game-server** does (and only when a hand is dealt). After any players-schema
change, verify by **starting a hand**, not by loading the login page.

## Quick Play bots (cold-start fillers — behind `BOTS_ENABLED`)

Temporary, cleanly-removable AI fillers so early users always find a Quick Play game.
**Quick Play ONLY** (never manual rooms). All under `apps/game-server/src/bots/`.

- **One decision engine + an identity pool.** `bots/strategy.ts` = pure `decide()`
  (reuses the engine evaluator; 4 personalities — conservative/aggressive/tricky/
  balanced — with per-identity jitter from `player_number`; bluffs; strong hands
  never fold; only legal actions). `bots/controller.ts` drives a bot's turn via the
  optional `RoomDeps.bots` seam (`room.ts beginTurnOrAdvance` → `deps.bots?.onTurn`)
  with human-like delays. `bots/{pool,seating,runtime}.ts` manage identities + fill.
- **Identities = "Model B".** Real `users` rows in the **reserved `player_number`
  block ≥ 900000** (`BOT_PLAYER_NUMBER_BASE` in `@fp/shared`) — no schema column, no
  migration; the web resolves bot name/avatar/profile via the normal by-number
  endpoints. Each has a fabricated `player_metrics` row + a webp avatar; **NO wallet,
  NO user_stats**. Seeded by `bots/seed-bots.ts` (`pnpm db:seed-bots`) from
  `bots/identities.json` + `bots/avatars/` (sharp downscale to ≤256×256 webp, game-
  logo fallback; idempotent). **46 seeded (local + prod)**; fills toward 100 later.
  The 85MB avatar sources are gitignored; `identities.json` is committed.
- **Cold-start fill.** `QUICK_PLAY.botFillWindowSec`=8: when ≥1 human queues but
  below `minPlayers`, an 8s window then fills to a **randomized 4–6 seats**
  (`matchmaking.ts` + `socket.ts startTable` → `bots.fill`). Healthy all-human
  tables get no bots.
- **Ledger/stats isolation (critical).** A bot seat **never** writes
  `wallet_transactions`, `game_players`, `bets`, `GameResults`, `UserStats`, or
  `PlayEvents` (enforced in `room.ts` + `persistence.ts`). A human winner is credited
  the **full pot** (incl. bots' fake antes) — a real **mint** — via the normal
  idempotent ledger; a bot beating a human **burns** the human's real coins. ⇒ the
  per-game invariant Σ(delta) = −Σ(FOLD_FORFEIT) **does not hold** for bot games
  (scope any ledger-sum check to human-only). Bots play a fake in-memory stack.
- **Social fencing.** `player_number ≥ 900000` can't be liked/friended
  (`apps/web/src/app/api/social/*`) — generic 403, never reveals "bot"
  (`isBotPlayerNumber` in `@fp/shared`). Profiles stay viewable.
- **Flag + kill-switch.** `BOTS_ENABLED=true` on the game-server enables it (boot log
  `[bots] enabled — N identities loaded`); unset/`false` = byte-for-byte base game
  (`[bots] disabled`). Read in `index.ts`. **Kill-switch:** set `BOTS_ENABLED=false`
  in Railway → restart. **Prod state:** code deployed (`5e54d85`), 46 bots seeded,
  `BOTS_ENABLED=true` set by the operator.
- **FIXED (2026-06-23) — was: bot-table teardown leak.** A bot-containing table used to
  leak in memory after all humans left, because the teardown check counted bots (seated
  `connected:true`, never flipped). Now `socket.ts` tears down on **connected humans only**
  via `presence.hasConnectedHuman` (`p.connected && !p.isBot`), and the new reconnection
  grace defers teardown rather than firing on a transient drop. An emptied bot table closes
  once the last human is truly gone.
- **Remove entirely:** delete `apps/game-server/src/bots/`, the `deps.bots?` seam +
  call in `room.ts`, the social fence + `isBot` guards, and
  `DELETE FROM users WHERE player_number >= 900000`.

## Conventions

- DB: snake_case tables/columns via `@@map`/`@map`; all PKs `uuid`; all timestamps `timestamptz`.
- Wallet primitive lives in `packages/db` (needs Prisma); engine stays pure and I/O-free.
- Strict TypeScript everywhere. Zod for every external input.
