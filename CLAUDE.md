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

## Conventions

- DB: snake_case tables/columns via `@@map`/`@map`; all PKs `uuid`; all timestamps `timestamptz`.
- Wallet primitive lives in `packages/db` (needs Prisma); engine stays pure and I/O-free.
- Strict TypeScript everywhere. Zod for every external input.
