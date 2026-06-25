# Deferred Fixes Log — Super-Admin Dashboard build

**Working rule (set 2026-06-25):** while building the dashboard phases, the default is
**spot it → log it → do NOT fix it**. We finish all phases first, then do every fix as one
deliberate pass at the end. Exception: if something **blocks** the current phase, fix it to
keep moving, state clearly what + why, and still log it here. Anything **prod-touching**
always needs explicit approval before running.

This log is carried forward verbatim into every phase report so nothing is lost.

Legend: **DEFERRED** = found, not fixed (default). **FIXED (blocking)** = had to fix to proceed.

---

## D1 — Schema/DB drift: stray `DROP DEFAULT` on 4 live tables — DEFERRED
- **Found:** Phase 0 (migration generation).
- **What:** `prisma migrate dev` proposed 4 unrelated statements:
  `ALTER TABLE ... ALTER COLUMN "updated_at" DROP DEFAULT` on
  `football.player_season_stats`, `link_up.player_metrics`, `platform.friendships`,
  `platform.user_avatars`.
- **Where:** the local DB has a DB-level default (`CURRENT_TIMESTAMP`) on these `updated_at`
  columns, but the Prisma schema marks them `@updatedAt` with no `@default`, so Prisma wants
  the DB default dropped. Pre-existing drift, unrelated to the admin feature.
- **Why it matters:** low runtime risk (these are `@updatedAt`, always set by the Prisma
  client on write), but it's real schema↔DB drift that will keep surfacing in every future
  `migrate dev` and pollute unrelated migrations. Prod almost certainly has the same drift.
- **Action taken:** **removed** these 4 statements from the admin migration so it stays purely
  additive (note left in the migration SQL). Drift itself left untouched.
- **Suggested fix (later):** one dedicated, reviewed migration that drops these defaults
  (verify no raw-SQL INSERT relies on them first), applied prod via migrate-first.

## D2 — `football_poker_test` DB was completely unmigrated — FIXED (blocking, local only)
- **Found:** Phase 0 (running admin-core tests).
- **What:** the local test DB (`TEST_DATABASE_URL` → `football_poker_test`) had **no tables**,
  so any DB-backed test failed with `platform.users does not exist`.
- **Why it blocked:** Phase 0's bootstrap/idempotency tests can't run without a migrated test DB.
- **Action taken (necessary):** ran `prisma migrate deploy` against `football_poker_test`
  (local only, non-prod) to apply all 24 migrations. Tests then passed (admin-core 6/6).
- **Suggested fix (later):** add a documented `db:test:setup` script / note so the test DB is
  reproducibly migrated; consider a CI step. Local-only; no prod impact.

## D3 — Node engine pin mismatch (Node 24 vs pinned 20) — DEFERRED
- **Found:** Phase 0 (every pnpm command prints `WARN Unsupported engine`).
- **What:** root `engines` + `.nvmrc`/`.node-version` pin Node 20; the machine runs Node 24.
- **Why it matters:** noise only; builds/tests pass. Pre-existing (also noted in the
  pre-launch audit).
- **Suggested fix (later):** widen the pin to `>=20` or align the local Node version.

## D5 — Migration-history divergence: prod ahead of the deploy branch — DEFERRED (operational, prod-relevant)
- **Found:** Phase 0 (after applying the admin migration to prod, migrate-first).
- **What:** prod's `_prisma_migrations` now records `20260625064625_add_admin_authority`
  as applied, but the **auto-deploy branch `feat/fame-score-system` does not contain that
  migration file** (it lives on `feat/admin-dashboard`).
- **Why it matters:** if `feat/fame-score-system` is deployed **before** the admin migration
  is merged into it, the predeploy `prisma migrate deploy` will see a migration applied on the
  DB but missing from that branch's folder — at minimum it reports divergence, and it may fail
  the deploy. This is the expected, known cost of doing migrate-first from a feature branch.
- **Mitigation (do this, not blocking now):** do **not** deploy `feat/fame-score-system` until
  the admin migration is present in the deploy path — i.e. merge the admin work (or at least
  the migration) into the deploy branch, or switch the deploy branch to the merged result,
  before the next prod deploy. No deploy is in progress, so nothing is broken right now.

## D6 — Admin access-audit granularity / render-time write — DEFERRED
- **Found:** Phase 1 (admin shell).
- **What:** the `/admin` landing page records an `admin.dashboard_access` audit row
  inside the Server Component render (`apps/web/src/app/admin/page.tsx`).
- **Why it matters:** a DB write during render can fire more than once per real visit
  (React dev double-render; RSC prefetch if a link to /admin is ever added). Today there
  is no link to /admin and admins reach it by typing the URL, so it's effectively one row
  per visit — acceptable for the Phase 1 gate proof, but not the right long-term shape.
- **Suggested fix (later):** move access logging out of render — e.g. log on admin
  sign-in, or via a route handler / server action invoked once on mount; consider a
  per-session throttle so the audit log isn't padded with access rows.

## D7 — Web build fails without `--use-system-ca` (corporate TLS + next/font) — DEFERRED (env)
- **Found:** Phase 1 (web production build).
- **What:** `next build` fetches `Inter` + `Tajawal` from Google Fonts at build time
  (`apps/web/src/app/layout.tsx`); behind this machine's corporate TLS interception the cert
  fails (`unable to verify the first certificate`) and the build aborts.
- **Why it matters:** any LOCAL production build on this machine fails unless prefixed with
  `NODE_OPTIONS=--use-system-ca`. Railway is unaffected (no interception there), so prod
  deploys are fine.
- **Action taken (blocking, env-only):** re-ran the build as
  `NODE_OPTIONS=--use-system-ca pnpm --filter @fb/web build` to verify Phase 1. Not a code change.
- **Suggested fix (later):** document the flag as the standard local-build command, or
  self-host the two fonts via `next/font/local` so the build needs no network (faster + robust).

## D8 — Live-rooms view needs game-server deploy + INTERNAL_API_TOKEN in prod — DEFERRED (operational, prod)
- **Found:** Phase 2 (live rooms).
- **What:** `/admin/live` reads the new authenticated `GET /internal/admin/rooms` on the
  game-server. In prod this needs (a) the game-server redeployed with this endpoint, and
  (b) `INTERNAL_API_TOKEN` set on BOTH the web and game-server services (the endpoint is
  closed/401 without it). The pre-launch audit already flagged `INTERNAL_API_TOKEN` as unset.
- **Why it matters:** until both are done, `/admin/live` shows a graceful "couldn't fetch"
  message (no crash). Every other Phase 2 view works straight from the DB.
- **Suggested fix (later, prod, needs approval):** set `INTERNAL_API_TOKEN` on web +
  game-server in Railway and deploy the game-server with the endpoint (mind D5 — the deploy
  branch must contain this code).

## D9 — Admin kick from a MANUAL room doesn't prevent rejoin — DEFERRED (refinement)
- **Found:** Phase 4 (kick seat).
- **What:** `kickSeat` removes the seat + disconnects the socket (reusing the proven leave
  path, so the live-hand refund/fold stays correct). For QUICK_PLAY rooms the no-rejoin rule
  makes it a true kick; for MANUAL rooms the kicked player can rejoin via the invite code/link
  (manual rooms allow rejoin while open).
- **Why it matters:** there is no per-room ban yet. For a problematic player on a manual table,
  the stronger tools are **force-close the table** (Phase 4) or **disable the account** (Phase 3).
- **Suggested fix (later):** a per-room kicked-user set checked on `room:join` to block rejoin
  after an admin kick.

## D10 — Admin 2FA not built (recommended hardening) — DEFERRED (documented)
- **Found:** Phase 6 (hardening checkpoint).
- **What:** the dashboard gate is session + admin-row + optional IP allowlist (`ADMIN_IP_ALLOWLIST`,
  implemented). True multi-factor (TOTP) step-up for `/admin` is **not** built.
- **Why it matters:** the super-admin is the highest-value account; 2FA is the strongest single
  hardening. Lower-cost mitigations (IP allowlist, ban enforcement, audit) are already in place.
- **Suggested fix (later):** TOTP secret on a `platform.admin_mfa` row, enrolled per admin, verified as a
  post-login step-up; natural fit at the P3 separate-origin boundary. Design noted in
  `docs/admin-dashboard/OPERATIONS.md` (Security posture).

## D4 — Prisma config deprecation + major upgrade available — DEFERRED
- **Found:** Phase 0 (generate/migrate output).
- **What:** `package.json#prisma` is deprecated (Prisma 7 wants `prisma.config.ts`); also
  Prisma 6.19.3 → 7.8.0 major upgrade is available.
- **Why it matters:** purely informational now; a v7 upgrade is a separate, deliberate task.
- **Suggested fix (later):** migrate to `prisma.config.ts`; evaluate the v7 upgrade on its own.
