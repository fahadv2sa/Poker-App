# Admin Dashboard — Migration Playbooks (no-rewrite upgrade paths)

This is the documented proof of the "no rewrite later" promise (condition 1). The dashboard was
built as **Proposal 2** deliberately so both upgrades below are **additive moves**, not rewrites.

The two structural properties that make this true (verified in Phase 6):
- **All admin logic lives in the isolated `@fb/admin-core` package** — authz (`can`/`loadAdminContext`),
  audit, read views, write actions, admin management, and the game-server **HTTP** client. The web app's
  `/admin` pages are thin (gate → call a service → render).
- **The game-server boundary is HTTP only** (`/internal/admin/*`, token-gated). No in-process coupling.
- **Authority data lives in the `platform` schema**, keyed on the opaque `user_id`.

---

## Playbook A — P2 → P3 (standalone admin service)

**When (any one):** a 2nd game goes live in prod · ~5+ admins needing differentiated roles · a hard
isolation/compliance need (separate origin, mandatory 2FA, IP isolation) · admin deploy/uptime must be
decoupled from the player web app.

**Steps (additive):**
1. **New app, same monorepo:** create `apps/dashboard` (its own Next.js app / Railway service) that
   imports `@fb/admin-core` and `@fb/shared` — the **same packages**, unchanged.
2. **Move the route group:** lift `apps/web/src/app/admin/**` into `apps/dashboard` (pages + server
   actions + client controls). They already depend only on `@fb/admin-core` + `lib/admin-*` helpers
   (`admin-guard`, `admin-gameserver`, `admin-ip`, `admin-error`) — move those `lib/admin-*` files too.
3. **Auth:** reuse the same `AUTH_SECRET` JWT (the cross-game identity contract). The standalone service
   verifies the session the same way; `loadAdminContext(userId)` is unchanged.
4. **Game-server:** **no change** — the new service calls the exact same `/internal/admin/*` endpoints
   with the same `INTERNAL_API_TOKEN` (the `createHttpAdminGameServerClient` transport is identical).
5. **Harden:** the separate origin is where 2FA + IP allowlist + admin-only login naturally live.
6. **Remove** the `/admin` route group from `apps/web` once the dashboard app is serving.

**What does NOT change:** `@fb/admin-core` (logic), the `platform.*` tables, the game-server endpoints,
the identity contract. That's the whole point.

---

## Playbook B — Monorepo → poly-repo (platform split)

**When:** games become independent products (separate teams / release cadence / repo-level access), or
a game wants its own repo/Railway project.

**Target shape** (already anticipated in `docs/architecture/PLATFORM_CONTRACTS.md §6`):
```
football-b/
  platform/   → @fb/shared, @fb/db (platform+football schemas), @fb/admin-core, apps/dashboard
  link-up/    → game #1 (own repo) — owns the link_up schema
  top-10/     → game #2 — owns its own schema
```

**Steps (additive):**
1. Extract `packages/{shared,db,admin-core}` + `apps/dashboard` into a `platform/` repo; publish the
   shared packages (private registry) or vendor them.
2. Each game repo depends on the published `@fb/shared` (claims + permission registry) and authenticates
   via the shared `AUTH_SECRET`; it keys its data on `user_id` only (no DB-level FK assumed — see the
   contract). Per-game DBs/schemas stay possible exactly because of this.
3. Each game exposes its **own** thin admin seam (its `/internal/admin/*` equivalent); the central
   dashboard manages it over HTTP — same pattern as Link Up's today.
4. The dashboard lives in `platform/` (never inside a game).

**What does NOT change:** the identity-by-`user_id` contract, the football-data read seam, the admin
authority model. Each extraction is move-the-folder + publish-the-package.

---

## The trigger summary (when to think about P3)
There is **no player-count trigger** — P2 scales fine for the player side (admin is isolated from
gameplay; verified Phase 6). The signals are about **games, admins, and isolation**: a 2nd live game,
~5+ differentiated admins, or a hard security/isolation/uptime-decoupling requirement. Below all three,
co-hosted P2 is the correct, cheaper shape.
