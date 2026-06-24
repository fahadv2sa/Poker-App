# `@fb/db` ops scripts

One-off operational scripts. **Not part of the app or the build** — run manually
against a target database. Each is **idempotent** (safe to re-run) and goes through
the wallet primitive (`SELECT … FOR UPDATE` + idempotent `reference` + balance moved
in lockstep with the ledger), so wallet integrity holds.

Run from the repo root (set the target `DATABASE_URL` inline; corporate TLS needs
`NODE_OPTIONS=--use-system-ca`):

```bash
DATABASE_URL="<connection-string>" NODE_OPTIONS=--use-system-ca \
  pnpm --filter @fb/db exec tsx scripts/<script>.ts [args]
```

| Script | What it does |
|--------|--------------|
| `grant-bonus.ts` | Credits +10,000 Coins to every existing user (`BANK_CLAIM` ledger rows, deterministic reference → no double credit). |
| `abandon-game.ts <gameId>` | Voids one orphaned `IN_PROGRESS` game: refunds the **unresolved** hand's committed coins and marks it `ABANDONED`. Completed hands (with a `resolve` row) are preserved. Mostly redundant now — the game-server reconciles orphans automatically at boot (`apps/game-server/src/recovery.ts`); kept for targeting a specific game on demand. |

> Use the **public** connection string for Railway (`*.proxy.rlwy.net`), not the
> internal one. These touch production data — double-check the target DB first.
