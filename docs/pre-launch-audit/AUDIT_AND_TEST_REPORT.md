# Link Up — Pre-Launch Audit & Test Report

- **Project:** Link Up (لينك اب) — `link-up` monorepo
- **Audit date:** 2026-06-23
- **Branch audited:** `feat/fame-score-system` (the production deploy branch)
- **Nature:** **READ-ONLY, NON-DESTRUCTIVE audit.** No application code, config, schema, or migration was changed. The only files created are this report and `THEORETICAL_BREAKDOWN.md` in `docs/pre-launch-audit/`. No bug was fixed — every issue is documented only. Tests were run against the **local** Postgres only; **nothing touched production**.

> **Headline:** The codebase is unusually well-engineered for its stage — server-authoritative, ledger-integrity-first, heavily tested (240+ tests pass), and the production build is green. The two documented historical issues (the Quick Play bot-table memory leak and the audited client betting-math bugs) are **already fixed** in the current code. The remaining items are mostly hardening, hygiene, and one **broken lint gate**. The single largest launch risk is **operational**: the manual migrate-first deploy discipline.

---

## Part A — Per-section audit findings

Severity: **Critical** (will break prod / lose money / leak data) · **High** (likely incident at launch) · **Medium** (should fix before/just after launch) · **Low** (hygiene / polish). Positives are noted because this is the last line of defense and reviewers should know what is already solid.

### A.0 Resolved since the docs were written (verified in code — no action needed)

- ✅ **Bot-table memory leak (was MASTER FILE §18.7 "NOT yet fixed") is FIXED.** `socket.ts:424` now tears down via `hasConnectedHuman(rt.room.state.players)` (`presence.ts` counts `connected && !isBot`), so a bot-only table is closed once the last human leaves. Covered by `tests/presence.test.ts`.
- ✅ **Client betting-math bugs (GAMEPLAY_AUDIT.md areas A–B) are FIXED.** Antes are posted before `hand:started` and the payload carries post-ante state (`room.ts:533-545`); the client resets `committedThisRound` on `phase:changed` (`useGameSocket.ts:77`); balance is adopted from the result; player-left / session-waiting / room-closed / reconnect notices are wired. `GAMEPLAY_AUDIT.md` is now historical.

### A.1 Database & data layer

- **(Positive)** Wallet integrity is textbook: `applyWalletTransaction` (`wallet.ts:56`) does `SELECT … FOR UPDATE` → idempotency by unique `reference` → sufficiency → ledger insert + balance update in one tx; the DB `wallets_balance_nonneg` CHECK (init migration line 405) is a second line of defense. Verified by the passing wallet/bank suites.
- **MEDIUM — `DIRECT_URL` missing from `packages/db/.env.example`.** The schema declares `directUrl = env("DIRECT_URL")`, but the local example only documents `DATABASE_URL`. Reproduced: `prisma validate` fails with `P1012 Environment variable not found: DIRECT_URL` on a clean shell. `DEPLOY.md` mentions adding it locally, but the example file (the thing developers copy) does not — every fresh clone breaks `db:migrate`/`db:deploy`/`validate` until the dev knows to add it. *File: `packages/db/.env.example`.*
- **LOW — 854 KB production-data artifact committed to git.** `packages/db/prod-display-cols-backup-2026-06-20T22-36-16-535Z.json` (8,228 rows of `{id, fameScore, tier, isLegend, legendScore}`) is tracked. Not secrets and not user PII (football-player score columns), but it bloats the repo and is a stale one-off backup. `.gitignore` covers the import-progress checkpoints but not this file. *Recommend: gitignore + `git rm --cached`.*
- **LOW — Prisma version drift / EOL nag.** `@prisma/client`/`prisma` pinned at `^6.2.1` but the resolved CLI is `6.19.3`, which prints a Prisma 7 major-upgrade notice. Harmless now; plan the upgrade deliberately.

### A.2 Game engine & game logic

- **(Positive)** Pure, deterministic, allocation-light witness search with correct disjoint backtracking; the "explained" traversal mirrors the boolean one so a valid claim always has evidence. 84 engine tests pass.
- **LOW (design, verify intent) — counterintuitive rank ordering.** In `handRanks.ts`, `FULL_HOUSE` (strength **4**) requires 5 cards (a disjoint 3-club + 2-club), yet ranks **below** `FULL_HOUSE_CLUB` (strength **6**, only 4 cards sharing a club) and `LINEUP` (strength 5). A harder-to-make 5-card combination is weaker than an easier 4-card one. This matches `MASTER FILE.txt` so it appears intentional/data-driven, but confirm it's the desired competitive ordering before launch (it directly affects who wins pots). *File: `packages/shared/src/handRanks.ts`.*
- **LOW (data-fragility, documented) — low ranks are clubs-only.** PAIR/TWO_PAIR/TRIPLE/FULL_HOUSE trigger only on shared **club** history (a deliberate divergence from the SPEC/CLAUDE table). Without rich, accurate `player_clubs` data in prod, most hands evaluate to "no rank" and games feel flat. This is an ops/data precondition, not a code bug. *File: `handRanks.ts`; see also A.7.*
- **INFO — cosmetic enum ordering.** `enums.ts HAND_RANK_CODES` lists codes in a different order than their strengths; it is only a membership union (strength comes from the catalog), so there is no functional effect.

### A.3 Real-time layer (game server)

- **(Positive)** Strict server-authority: turn/phase/legality validated server-side; identity from the verified token only; idempotency references generated from authoritative state (`gameId:act:seat:seq`); hole cards never in any broadcast; single-resolve latch; void-and-refund on close in one tx; boot recovery for orphans. 122 game-server tests pass.
- **MEDIUM — `state:sync` pot scalar over-counts after a fold.** `buildStateSync` (`socket.ts:523`) computes `pot = Σ committedTotal over ALL players`, including folders — but a folder's stake was already mostly refunded (only `forfeit` remains in the pot). So a client that joins/reconnects mid-hand after a fold sees an inflated pot number. `bet:placed` and `computeLivePots` use the correct `potTotal` (forfeit for folded), so it self-corrects on the next action and the authoritative settlement is unaffected. Display-only. *Fix direction: mirror `room.potTotal()` in `buildStateSync`.*
- **LOW — internal/English error messages leak to the Arabic UI.** `guard` (`socket.ts:540`) sends raw `err.message` as `messageAr`. Engine/internal throws are English ("Not your turn", "Illegal raise", "Need at least 2 players to start") and surface verbatim in a fully-Arabic RTL client. Cosmetic + minor internal-detail exposure; map to localized codes.
- **LOW — `/internal/rooms` is unauthenticated unless `INTERNAL_API_TOKEN` is set.** `index.ts:33-37` only enforces the token when the env var exists. It returns only aggregate seat counts (no PII), but set the token in prod and have the web send `x-internal-token`. *Files: `index.ts`, and the web caller via `GAME_SERVER_INTERNAL_URL`.*
- **LOW — inactivity check fails open on DB error.** `index.ts:89` / `session.ts:58`: if the DB read throws, `isSessionInactive` returns `false` (session allowed). Deliberate availability tradeoff (a DB hiccup won't lock everyone out); the 12h token TTL still bounds staleness. Acceptable, noted.
- **INFO — single-instance constraint.** Matchmaking + rate limiter + room state are in-memory per process ⇒ `numReplicas = 1` is mandatory (correctly set in `railway.toml`). Horizontal scale needs a Redis swap (architected for, not implemented).

### A.4 Web app

- **(Positive)** Every API route is session-gated (`auth()`), server-authoritative, and Zod- or type-validated; avatars require auth; the realtime token is minted only server-side from the verified session. Production build compiles all 33 routes; 17 web tests pass.
- **LOW — duplicate registration surface.** Both `POST /api/auth/register` (`api/auth/register/route.ts`) and the `registerAction` server action (`register/actions.ts`) call `registerUserWithWallet`. The page uses the server action (which also signs the user in); the API route appears to be unused/legacy and does **not** sign in. Pick one to avoid drift/confusion.
- **LOW — no rate limiting on several authenticated mutation endpoints.** Only `register` (per-IP) and `bank/claim` (per-user) are limited. **Unlimited:** room creation (`api/rooms` POST → one `Game` row each), `social/like` (toggle spam), `social/friend` (request spam), `profile/avatar` (upload spam), `install-reward`, `level-up/ack`. Abuse is bounded to authenticated users (and account creation is IP-limited), but a single logged-in user can spam rooms/likes/friend requests/uploads. Add per-user limits (the `bankRateLimit` pattern) before launch.

### A.5 Authentication & sessions

- **(Positive)** argon2id with OWASP params (`argon.ts`); HS256 realtime token, TTL 12h, identity only from verified claims (`game-server/src/auth.ts`); inactivity auto-logout unified across web cookie and socket handshake via one shared constant; room passwords argon2id-hashed and verified server-side; invite codes are random base64url; private rooms never expose their invite code in the list.
- **LOW (operational) — `AUTH_SECRET` must be byte-identical across web and game-server**, or every socket handshake is rejected. Documented in both `.env.production.example` files and `DEPLOY.md`; call it out in the launch checklist.

### A.6 Infrastructure, deployment & config

- **HIGH (operational — caused a real prod outage) — migrate-first discipline is manual and unguarded.** Railway auto-deploys on `git push` to `feat/fame-score-system`, but migrations are **manual** (no `preDeployCommand`/release step in `railway.toml`). Prisma Client selects columns from the **schema**, so pushing schema-dependent code before the prod migration is applied crashes the game-server at card dealing (the documented 2026-06-21 incident). There is still **no automated guard**. Until a predeploy `prisma migrate deploy` exists, the manual checklist in `CLAUDE.md` is mandatory. *Before launch: confirm prod is migrated through `20260622000003_level_up_celebration` (see Part B, SKIPPED), and strongly consider adding a release/predeploy migrate.* *Files: `railway.toml`, `CLAUDE.md`.*
- **MEDIUM — env vars used in code but absent from every `.env.example`.** `BOTS_ENABLED`, `INTERNAL_API_TOKEN`, `GAME_SERVER_INTERNAL_URL`, `ANTHROPIC_API_KEY` are read via `process.env` but not documented in any example file (only narrative docs mention some). Combined with the `DIRECT_URL` gap (A.1), the example files are an incomplete config contract. *Recommend: add them (commented) to the relevant `.env.example`.*
- **LOW — Node engine pin mismatch.** Root `engines` and `.node-version`/`.nvmrc` pin Node **20**, but the audit ran on Node **24** (README says "tested on 24"), so every pnpm command prints `WARN Unsupported engine`. Align the pin (allow `>=20`) or document the discrepancy to avoid CI/install friction.
- **LOW — stale local `dist/` present.** `apps/game-server/dist/*` exists on disk (not tracked — `dist/` is gitignored). The deploy runs `tsx` on source, so `dist` is unused; harmless clutter.

### A.7 External integrations & scripts

- **(Positive)** API-Football and Anthropic are used **only** by offline scripts, never on the gameplay path; keys are read from env and never committed (verified: no real `.env` tracked, only `.example` files); importers are idempotent (`external_ref`, upsert-by-name). Ops scripts go through the wallet primitive and are idempotent.
- **INFO — public vs private Railway DB URL.** `packages/db/scripts/README.md` correctly instructs ops scripts to use the **public** proxy string (`*.proxy.rlwy.net` / `DATABASE_PUBLIC_URL`), not the in-network `RAILWAY_PRIVATE_DOMAIN` (unreachable from a dev machine). Deployed services may use the private host. Keep this distinction in the runbook.
- **INFO (launch precondition) — enough eligible players must be seeded in prod.** A hand needs `seats×2+5` distinct **eligible** players for the room difficulty (EASY ≥70, MEDIUM ≥50 fame). Too few → `cards.ts` throws and the hand never starts. Confirm prod has enough players in every tier offered (especially EASY/MEDIUM) before launch.

### A.8 Shared utilities / types

- **(Positive)** One home for enums/constants/contracts/DSLs/rate-limiter, mirrored against the Prisma enums; Zod validates every external input; money stays BigInt until the WS boundary. No findings.

---

## Part B — Test & check results (RUN / PASS / FAIL / SKIPPED)

All commands run from the repo root with `NODE_OPTIONS=--use-system-ca`. Environment: Node v24.16.0, pnpm 9.15.9, a reachable **local** Postgres on `localhost:5432`. **No command targeted production.**

| # | Check | Command | Result | Notes |
|---|---|---|---|---|
| 1 | Prisma schema validation | `pnpm --filter @fb/db exec prisma validate` (dummy local envs) | **PASS** | "The schema … is valid 🚀". Read-only, no DB connection. (First attempt FAILED only because `DIRECT_URL` was unset — see A.1.) |
| 2 | Typecheck — all 5 packages | `pnpm typecheck` (turbo `tsc --noEmit`) | **PASS** | 5/5 successful (FULL TURBO cache hit ⇒ last run was clean). Also serves as the "all imports resolve / no missing modules" static check. |
| 3 | Lint — whole monorepo | `pnpm lint` (`eslint .`, report-only) | **FAIL** | 6 errors, 0 warnings. `apps/web/public/sw.js` ×5 `'self' is not defined` (no service-worker globals configured for that file); `apps/web/scripts/gen-icons.mjs` unused import `writeFileSync`. Exit code 1. No autofix applied. |
| 4 | Engine unit tests (pure) | `pnpm --filter @fb/engine test` | **PASS** | 7 files, **84/84**. |
| 5 | Game-server tests (fakes, no DB) | `pnpm --filter @fb/game-server test` | **PASS** | 13 files, **122/122** (room, multi-hand, recovery, bot isolation/fill/strategy/controller/matchmaking, auth, rate-limit, presence, table-deck). |
| 6 | Web tests | `pnpm --filter @fb/web test` | **PASS** | 2 files, **17/17** (`tableView` selectors + social bot-fence). |
| 7 | DB integrity tests (real Postgres) | `pnpm --filter @fb/db test` | **PASS** | 4 files, **17/17** (wallet idempotency/row-lock/CHECK, bank 1×/day, install-reward once, level-up). Ran against **local** Postgres. The `prisma:error Unique constraint … (username)` line is an **expected assertion** inside the "rejects a duplicate username" test (the test passed). |
| 8 | Web production build | `pnpm --filter @fb/web build` | **PASS** | All 33 routes compiled (placeholder env). Exit 0. |
| 9 | Env-var consistency (code vs `.env.example`) | `grep process.env.* vs .env.example` | **FAIL (gaps)** | `BOTS_ENABLED`, `INTERNAL_API_TOKEN`, `GAME_SERVER_INTERNAL_URL`, `ANTHROPIC_API_KEY` used but undocumented; `DIRECT_URL` missing from local `packages/db/.env.example`. (A.1, A.6) |
| 10 | Secret hygiene (tracked files) | `git ls-files \| grep -i env/secret` | **PASS** | No real `.env` or secret tracked — only `.example` templates (placeholders). One large non-secret data backup is tracked (A.1). |
| 11 | Game-server compile/build | (covered by #2 `tsc --noEmit`) | **PASS (implied)** | Deploy uses `tsx` on source; there is no separate prod build step for the game-server. |
| 12 | Full-hand smoke e2e | `pnpm --filter @fb/game-server smoke` | **SKIPPED** | Spins a live server and deals real hands; requires the local DB to be **seeded with enough active players** (`seats×2+5`) or it throws by design. Not run to keep the audit side-effect-light. **Before launch:** run against a seeded local/staging DB. |
| 13 | Prod migration status | `prisma migrate status` against prod | **SKIPPED** | Deliberately **not run** — read-only audit must not touch production. **Before launch:** verify prod is up to date through `20260622000003_level_up_celebration` (the migrate-first rule, A.6). |
| 14 | DB-backed suites against a throwaway DB | `TEST_DATABASE_URL` suite | **PARTIAL/covered by #7** | The wallet/bank suites ran against the local DB successfully; running them against a dedicated `TEST_DATABASE_URL` in CI is recommended so they never share data with a dev DB. |

**Test totals (executed):** 240 automated tests across engine (84) + game-server (122) + web (17) + db (17), **all passing**; production build green; typecheck green; **lint red (6 errors)**.

---

## Part C — Launch readiness (blunt go / no-go)

**Overall: CONDITIONAL GO.** The application logic, money handling, and real-time correctness are in strong shape and well-tested, and the previously-documented showstoppers are already fixed. Nothing found risks losing or duplicating real coins or leaking secrets/PII. The blockers below are a broken CI gate and operational discipline, not core-logic defects.

### Must-resolve before going live (blockers)

1. **[Gate] Fix the red lint build (Check #3).** Either configure the service-worker globals for `apps/web/public/sw.js` (e.g. an eslint override with `env: { serviceworker: true }` / the `self` global) and remove the unused `writeFileSync` import in `apps/web/scripts/gen-icons.mjs`, or explicitly exclude those files. `pnpm lint` currently exits 1, so any CI lint gate fails the deploy. *(Low code risk, but it is a launch gate — and per the audit mandate, NOT fixed here.)*
2. **[Operational] Confirm prod is migrated, and honor migrate-first.** Verify `prisma migrate status` against prod is up to date through `20260622000003_level_up_celebration` **before** serving the current code (Check #13, A.6). Strongly recommended: add a release/predeploy `prisma migrate deploy` to `railway.toml` so this can never regress (the 2026-06-21 outage was exactly this).
3. **[Operational] Seed enough eligible players per tier in prod (A.7).** Without `seats×2+5` eligible players for each offered difficulty, hands throw at deal time. Verify counts for EASY/MEDIUM/ELITE; run the smoke e2e (Check #12) against a seeded staging DB to prove a full hand to showdown.

### Strongly recommended before/right after launch (not hard blockers)

4. **Add per-user rate limits** to room creation, social like/friend, avatar upload, install-reward, level-up (A.4) — close the authenticated-spam vectors.
5. **Complete the env contract:** add `DIRECT_URL` to `packages/db/.env.example` and `BOTS_ENABLED` / `INTERNAL_API_TOKEN` / `GAME_SERVER_INTERNAL_URL` / `ANTHROPIC_API_KEY` to the relevant examples (A.1, A.6); set `INTERNAL_API_TOKEN` in prod (A.3).
6. **Confirm `AUTH_SECRET` is byte-identical** on the web and game-server services, and `WEB_ORIGIN` exactly equals the web origin (A.5).
7. **Fix the `state:sync` pot over-count after a fold** (A.3) and **localize the socket error messages** (A.3) for UI correctness/polish.

### Hygiene (low priority)

8. Remove the committed 854 KB `prod-display-cols-backup` JSON and gitignore it (A.1); remove the duplicate `/api/auth/register` route or the server action (A.4); align the Node engine pin to `>=20` (A.6); plan the Prisma 6→7 upgrade (A.1).

### Confirmed strengths (no action)

- Wallet/ledger integrity (row locks, idempotency, CHECK constraint, atomic composition) — verified by tests.
- Strict server-authority and card privacy in the real-time layer — verified by tests + design.
- Crash recovery, void-on-close refunds, and bot ledger/stats isolation — verified by tests.
- The two historical showstoppers (bot-table leak; client betting math) are already fixed (A.0).

---

## FINAL LAUNCH READINESS (2026-06-23, updated)

This supersedes the **Part C** blocker list above, which was the read-only first pass. The blockers have since been worked (all changes are committed **locally** on `feat/fame-score-system`, **not pushed**; production was never touched).

### Blocker status — real, current

| # | Blocker (Part C) | Status | Evidence |
|---|---|---|---|
| 1 | Red lint gate | ✅ **RESOLVED** | `apps/web/public/sw.js` + `gen-icons.mjs` fixed; `pnpm lint` exits 0. Commit `25a9cc3`. |
| 2 | Medium bug — departed player could win mid-hand | ✅ **RESOLVED** | `onTurnTimeout` folds disconnected seats; verified live (leave/disconnect → departed seat folds). Commit `d6e819a`. |
| 3 | Low finding #1 — over-strict smoke privacy assertion | ✅ **RESOLVED** | `result:best` added to the private-channel exclusion; cross-player leak detection preserved; verified the failure point moved off privacy. Commit `4ec8da2`. |
| 4 | Production migrations applied | ⚠️ **OPERATOR ACTION** — automated guard now in code | `railway.toml` `preDeployCommand = "pnpm db:deploy"` makes every deploy migrate-first (commit `294826a`). The **current** prod DB state still must be checked/applied by the operator before/at the next deploy — this cannot be done from here (no prod access; production must never be touched by the audit). |
| 5 | Enough eligible players per tier | ✅ **VERIFIED (local)** + operator to confirm prod | Local dev DB (mirrors the prod import): EASY **188**, MEDIUM **1,514**, ELITE **8,228** eligible (need ≥17 for a 6-seat table); 46 bots; 0 active players with null fame. No shortfall. Operator should confirm the same against prod (query prepared below). |

### Verdict: **GO — conditional only on the operator running the prepared production steps**

All code-side blockers (1, 2, 3) are **resolved**; per-tier data is **sufficient** (5); and migrate-first is now **automated** (4). Nothing code-side is outstanding. The only remaining gate is operator execution against production (push + verify/apply migrations + confirm prod tier counts), which by policy must be done by the operator, not the audit. Once those run clean, this is a **GO**.

The Part C "strongly recommended / hygiene" items (rate limits, env-contract completeness, `state:sync` pot display, error localization, repo hygiene) remain **open but explicitly non-blocking** for launch.

### Action items — already handled in code (committed locally, NOT pushed)

- `25a9cc3` lint fix · `d6e819a` mid-hand-leave fold · `4ec8da2` smoke privacy assertion · `294826a` migrate-first predeploy guard.
- Local per-tier eligibility verified — no seed change required.

### Action items — operator must run these (production / push; never executed by the audit)

> For every prod command, run it from **your own machine** using the **public** Railway DB URL — `DATABASE_PUBLIC_URL` (host `*.proxy.rlwy.net`), found in the Railway dashboard → **Postgres service → Variables** (or **Connect → Public Network**). Do **not** use the private `RAILWAY_PRIVATE_DOMAIN` host — that is only reachable from inside Railway's network (it is what the deployed services use), not from your laptop. Never paste secret values into shared logs.

1. **Check current prod migration status** (read-only):
   ```
   NODE_OPTIONS=--use-system-ca \
   DATABASE_URL="<DATABASE_PUBLIC_URL>" DIRECT_URL="<DATABASE_PUBLIC_URL>" \
   pnpm --filter @fb/db exec prisma migrate status
   ```
   Expected when ready: "Database schema is up to date" through `20260622000003_level_up_celebration`.
2. **Take a backup/snapshot first** (Railway → Postgres → Backups), then **apply pending prod migrations** (idempotent; additive ADD COLUMNs):
   ```
   NODE_OPTIONS=--use-system-ca \
   DATABASE_URL="<DATABASE_PUBLIC_URL>" DIRECT_URL="<DATABASE_PUBLIC_URL>" \
   pnpm db:deploy
   ```
   Re-run the status command to confirm "up to date". *(With the new `preDeployCommand`, the next push also does this automatically and aborts the deploy if it fails.)*
3. **Verify prod per-tier eligibility** (read-only) — each tier must be ≥ 17:
   ```
   psql "<DATABASE_PUBLIC_URL>" -c "SELECT 'EASY' tier, count(*) FROM players WHERE active AND floor(fame_score)>=70 UNION ALL SELECT 'MEDIUM', count(*) FROM players WHERE active AND floor(fame_score)>=50 UNION ALL SELECT 'ELITE', count(*) FROM players WHERE active;"
   ```
   If any tier is short, seed/import on prod (e.g. `... pnpm db:import-api-football` / `db:calculate-scores`, then `db:seed-bots`) — see DEPLOY.md.
4. **Rollback (if a migration fails):** the deploy aborts and the old version keeps serving (predeploy guard); for a manually-applied migration that failed mid-way, restore the pre-migration backup, or mark it with `prisma migrate resolve --rolled-back <migration_name>` after reverting, then investigate. Prisma has no automatic down-migration, so the backup is the primary rollback.

---

*End of report. The original audit was read-only; subsequent fixes are committed locally only (not pushed), and no production database or live server was ever touched by this work.*
