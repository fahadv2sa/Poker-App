# Football B — Platform Contracts (binding architecture decision record)

**Status:** binding. **Last updated:** 2026-06-24. **Scope:** the multi-game platform that this
repo (`link-up`) is the first game of.

This document is the **source of truth** for how games on the **Football B** platform share data and
stay isolated. Read it before adding a second game, touching identity/auth, touching the football
reference data, or planning any database change. Where this doc and code disagree, fix one to match —
don't silently diverge.

---

## 1. Vision (one paragraph)

**Football B (`فوتبول بي`)** is a platform that hosts multiple football games. **Link Up (`لينك اب`)** —
the poker game in this repo — is game #1 (live, real players). Planned: **Top 10 (`توب 10`)**,
**Guess the Player (`خمن اللاعب`)**, + a 4th. The games are **technically isolated** (own repos, own
Railway projects when they exist) and share **only two things**: a **single identity/login** and the
**football-players reference data**. Each game owns its own economy/stats — or has none.

---

## 2. The single most important artifact: table ownership

Every table in `packages/db/prisma/schema.prisma` belongs to exactly one of three groups. This is the
isolation boundary.

| Group | Owner | Tables | Sharing rule |
|---|---|---|---|
| **A — Identity & social** | **PLATFORM** (shared) | `users`, `email_otps`, `likes`, `friendships`, `user_avatars` | One account per person across all games. Read via the **identity contract** (§3), not by a second game reaching into these tables. |
| **B — Football reference data** | **SHARED raw material** | `players`, `nationalities`, `positions`, `clubs`, `player_clubs`, `player_national_teams`, `player_youth_clubs`, `player_tournament_stats`, `player_season_stats` | Read-mostly, owner-supplied. Read via the **football-data contract** (§4). Written only by the importer/seed scripts in `packages/db/prisma/*`. |
| **C+D — Game-owned (Link Up)** | **per-game** | `wallets`, `wallet_transactions`, `bank_claims`, `user_stats`, `player_metrics`, `play_events`, `badges`, `player_badges`, `hand_ranks`, `games`, `game_players`, `game_cards`, `bets`, `game_results` (+ any claim tables — see schema) | Owned **only** by Link Up. A future game gets its **own equivalents**. |

> `hand_ranks` is poker **rules** (the 9 ranks), not football data → it is **game-owned (D)**, not B.

### The rules (non-negotiable for any game on the platform)

1. **A game writes/reads only its OWN group-C+D tables.** It must never write — and should not
   read or cross-join — another game's C+D tables.
2. **Identity is referenced by `user_id` only.** A game stores the `user_id` it gets from the verified
   session token (§3); it must **not** assume a database-level foreign key to `users` will exist
   forever (this keeps separate-per-game databases open later — see §6). Display name/avatar come from
   the platform, not from joining `users`.
3. **Football data is read through the contract in §4**, never by duplicating or forking it.
4. **Per-game economy.** There is **no platform-wide wallet/level/XP.** Coins, stats, XP, and badges
   are per-game (Link Up owns the set above); another game defines its own — or has none.

---

## 3. Identity contract (already implemented — do not refactor)

**The shared `AUTH_SECRET`-signed JWT *is* the cross-game identity contract.** It already exists:

- The **web** app mints a short-lived realtime token from the verified Auth.js session.
- Any game verifies it with the **same `AUTH_SECRET`** and reads identity **only** from the
  cryptographically-verified claims: see `apps/game-server/src/auth.ts` → `verifyRealtimeToken()`,
  returning `{ userId, username, playerNumber }`; the claim shape is `realtimeClaimsSchema` in
  **`@fb/shared`**.

**What a future game does:** depend on `@fb/shared` for the claim schema, hold the same `AUTH_SECRET`,
verify the token, use the **opaque `userId`**. It does **not** import a shared `prisma.user` accessor and
does **not** join `users` across a database boundary. Richer profile details (nickname/avatar) are
fetched from a **platform endpoint**, not from the games table set.

> The ~27 `prisma.user.*` reads in the web app are the **platform/Link Up app's own internal** reads —
> they are not the cross-game contract and are intentionally **not** abstracted. Leave them.

When game #2 is built, the only identity work is: reuse `AUTH_SECRET` + `@fb/shared` claims + the verify
helper (optionally lifted from `apps/game-server/src/auth.ts` into a shared location at that time — a
small move shaped by the real second consumer, deliberately deferred).

---

## 4. Football-data access contract

**Today:** the only **runtime** football-data read is `apps/game-server/src/cards.ts`
(`PrismaCardSource`), which builds a per-difficulty deal pool and projects player cards. It is already
behind the **`CardSource`** port (`apps/game-server/src/ports.ts`). All other `players/clubs/...` access
is **importer/seed scripts** (`packages/db/prisma/*`), which are admin-time and own the **write** side.

**The contract for any game reading football data:**
- Treat football data as **read-only reference material**. Never write it from gameplay; never fork it.
- Access it through a **single narrow read interface** (the seam), e.g.:
  - `getDealPoolIds(difficulty) → string[]` (eligible player ids by `fame_score` floor)
  - `getPlayerCards(ids) → PlayerCard[]` (the dealt-card projection)
- This single seam is the **swap-point** for a future **network football-data API** (see §6): callers
  must not depend on Prisma or the DB shape directly, only on this interface.

**Deferred (intentionally):** physically extracting these reads into a dedicated **`@fb/football-data`**
package, and promoting that package to a network API, are deferred to **when game #2 lands**, so the seam
is shaped by a real second consumer rather than guessed. Until then the `CardSource` port already
provides the boundary; new code must keep football-data access funnelled through one module, not sprayed
across files.

---

## 5. What a new game MUST and MUST NOT do (checklist)

A new game (Top 10 / Guess the Player / #4), in its own repo/Railway project:

**MUST**
- Authenticate users via the shared `AUTH_SECRET` JWT (§3); key its data on the opaque `user_id`.
- Read football data only through the read contract (§4).
- Own its session/economy/stats tables (its own group-C+D), named in its **own namespace**.
- Appear on the hub as an entry in `apps/web/src/lib/games.ts` (route under `/games/<id>`).

**MUST NOT**
- Read or write another game's group-C+D tables, or cross-join them.
- Assume a DB-level foreign key from its tables to `users`.
- Introduce a platform-wide wallet/level/XP, or duplicate/fork the football data.
- Touch Link Up's live tables or the live ledger.

---

## 6. Deferred decisions (recorded so future work follows the intended direction)

These are **open and additive** — chosen now to keep them possible later without a rewrite, but **not**
built yet (avoid heavy commitments before their second consumer exists):

- **Per-game databases.** Today: one shared Postgres; identity (A) + football data (B) shared; Link Up's
  C+D co-resident. New games may take their **own schema/namespace** (or own DB) from birth. Because
  games reference `users` by id only (§2 rule 2), separate DBs stay possible. **Link Up's live tables are
  NOT migrated to a separate DB** except via a dedicated, separately-approved phase.
- **Network football-data API.** The §4 read seam is the swap-point; the API itself is deferred to game
  #2, and Link Up's deal path keeps its in-process read (with a cache/fallback) until the API is proven.
- **Repo / Railway split.** Link Up stays in this repo (`link-up` / project `Football-B`); the platform
  shell + football-data extract into their own `football-b-*` repos/projects later, additively.

---

## 7. Where the live system stands (for context)

- Renames done: brand → Link Up / Football B; package scope `@fb/*`; GitHub repo `link-up`; Railway
  project `Football-B`; Railway services `link-up` (= `apps/web`) and `game-server-link-up`
  (= `apps/game-server`), DB plugin `Postgres`. Domains deferred.
- Games hub live at `/`; Link Up lobby at `/games/link-up`; gameplay routes still top-level.
- See `CLAUDE.md` (deploy-safety + service-name notes), `DEPLOY.md`, and the technical summary for ops.
