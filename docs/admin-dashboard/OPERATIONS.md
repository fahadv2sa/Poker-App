# Admin Dashboard — Operations & Hardening

How to deploy, secure, and reason about the super-admin dashboard (Proposal 2). Companion docs:
`MIGRATION_PLAYBOOKS.md` (no-rewrite upgrades), `DEFERRED_FIXES_LOG.md` (the running fix log).

## What it is
A gated `/admin` route group in `apps/web`, backed by the isolated `@fb/admin-core` package and the
`platform.admins` / `admin_permissions` / `admin_audit_log` tables. Two tiers (SUPER_ADMIN, ADMIN);
extensible **string-key** permissions; every write audited.

## Deploy checklist (in order — migrate-first)
1. **Apply the admin migrations to prod BEFORE the code that reads them deploys** (migrate-first;
   `DEFERRED_FIXES_LOG` D5). The dashboard adds:
   - `20260625064625_add_admin_authority` (admin tables) — already applied to prod in Phase 0.
   - `20260625080220_add_admin_user_management` (`ADMIN_ADJUST` enum value + `users.disabled_at`) —
     **NOT yet applied to prod.** Apply it before deploying the branch (Phase 3 code reads `disabled_at`
     at login). Command (run by the operator):
     `NODE_OPTIONS=--use-system-ca DATABASE_URL=<prod> DIRECT_URL=<prod> pnpm --filter @fb/db exec prisma migrate deploy`
2. **Bootstrap the first super-admin** (idempotent), once the tables exist:
   `... pnpm --filter @fb/admin-core exec tsx scripts/bootstrap-super-admin.ts --email <you>`
   (Done in prod for `fahad.v2.sa@gmail.com` / #100011.)
3. **Set env vars:**
   - `INTERNAL_API_TOKEN` — **required on BOTH** the web and game-server services for the live
     view/controls (the `/internal/admin/*` endpoints are closed/401 without it; `DEFERRED_FIXES_LOG` D8).
   - `GAME_SERVER_INTERNAL_URL` (optional) — internal URL the web uses to reach the game-server.
   - `ADMIN_IP_ALLOWLIST` (optional) — comma-separated source IPs; when set, only those reach `/admin`.
4. **Deploy the game-server** with this branch so `/internal/admin/*` (live view + force-close/kick/bots)
   exists. DB-backed views (users/economy/games/football/admins) work without it.

## Security posture
- **Gate:** non-admins (unauthenticated OR logged-in non-admin) get a **404**, never 403/redirect — no
  existence leak. Enforced server-side in `requireAdminPage`; runs only under `/admin`.
- **IP allowlist (implemented, opt-in):** `ADMIN_IP_ALLOWLIST`. Checked first, before identity work.
- **Ban enforcement:** a disabled account is refused at web login AND the realtime handshake.
- **Internal endpoints:** `/internal/admin/*` always require `INTERNAL_API_TOKEN` (they return identity
  and perform live control). The legacy `/internal/rooms` (aggregate counts only) keeps optional gating.
- **Audit:** every admin write appends an immutable `admin_audit_log` row (actor, action, before/after,
  ip). No FK to `users`, so history survives account deletion.
- **2FA (recommended, deferred):** not built. Recommended design when it lands — a TOTP secret on a
  `platform.admin_mfa` row, enrolled per admin, verified as a step-up after login for `/admin`. It is the
  natural fit at the **P3** boundary (separate origin) — see `MIGRATION_PLAYBOOKS.md`.
- **Admin-auth rate limiting:** brute-forcing *admin status* isn't possible (it requires a valid session
  + an `admins` row). The password brute-force surface is the platform login (shared, not admin-specific);
  tightening it is tracked outside this dashboard.

## Performance / isolation (condition 4 — verified Phase 6)
- `@fb/admin-core` is imported **only** by `/admin` routes + `lib/admin-*` helpers. The **game-server does
  not import it at all**; **no player-facing web file imports it.** (Verified by grep; the `@fb/shared`
  match is a doc comment, not a dependency.)
- The only admin-related read on a player path is `@fb/db isUserDisabled` at login/handshake — one
  indexed lookup, fail-open, no gameplay hot-path change (game-server's 124 tests unchanged across phases).
- **Audit-log growth plan:** `admin_audit_log` is append-only, indexed by `(actor, created_at)` and
  `(target_type, target_id)`, and **queried only by the dashboard** — never joined into gameplay. It can
  grow to millions of rows with zero effect on the live game. When size becomes an ops concern: add monthly
  range **partitioning** on `created_at` (or archive cold rows to cheap storage). Do **not** auto-prune —
  audit immutability is the point; deletion, if ever needed, is a deliberate, separately-approved op.

## Capability map (what the dashboard does today)
- **Visibility (read):** overview counts · users (search/detail/ledger) · economy (recent ledger) ·
  games (list/detail) · football (browse/detail) · live rooms (per-seat, via the game-server).
- **Control (write, audited, `can()`-gated):** ledger-safe coin adjust (`ADMIN_ADJUST`) · verify email ·
  reset password · disable/enable (ban) · delete user · force-close table · kick seat · pause/resume bots.
- **Admin management:** appoint/remove admins, set tier, suspend/activate, per-permission grants — with
  anti-lockout (last-super / self-super / promote-by-non-super guards).
