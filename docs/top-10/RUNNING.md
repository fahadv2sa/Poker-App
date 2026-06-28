# Top Ten (توب 10) — local run & status

Game #2 on the Football B platform. Built **inside this repo** with its own `top_10`
Postgres schema and its **own two services** (web + game-server), independent of Link Up.

## What's built (all local, nothing deployed)

| Piece | Location |
|---|---|
| DB schema + migration | `packages/db/prisma/schema.prisma` (`top_10` schema) · migration `*_add_top_10_game` |
| Pure engine (ranking, 2 tiebreaks, gate, difficulty, XP, bots, round state machine) | `packages/top-10-engine` |
| Question-catalog builder + reviewable artifact | `packages/db/prisma/build-top10-catalog.ts` → `docs/top-10/CATALOG.md` / `.json` |
| Authoritative Socket.IO server | `apps/top-10-server` |
| Next.js web app (own Auth.js, lobby, 3 quick-play queues, create room, live match, filtered search) | `apps/top-10-web` |
| Shared gold-on-black UI (copied from Link Up; Link Up untouched) | `packages/top-10-ui` |
| Quick-play bot fillers (reuse Link Up's bot users; never get XP) | `apps/top-10-server/src/bots.ts` |

Shared contracts live in `@fb/shared` (`top10.ts`, `top10.ws.ts`).

## Prerequisites

- Local Postgres running with the football data loaded (same DB as Link Up).
- One-time: build the question catalog into `top_10`:
  ```
  NODE_OPTIONS=--use-system-ca pnpm db:build-top10-catalog
  ```
  (251 questions admitted today: GOAL_SCORERS 89, KEY_PASSES 69, TACKLES 63, ASSISTS 16,
  ACCURATE_PASSES 14 — balanced EASY/MEDIUM/HARD. Re-run anytime; it supersedes the prior
  generation and rewrites the artifact.)

## Run it (two terminals)

```
# 1) Top Ten game-server (Socket.IO) on :4100  (BOTS_ENABLED=true in .env.local)
pnpm dev:top10-server

# 2) Top Ten web app (Next.js) on :3100
pnpm dev:top10-web
```

Open http://localhost:3100 → log in with an **existing** Football B account (Top Ten shares
the platform identity; registration lives in the Link Up/platform app). Then:
- **Quick play**: pick a level → bots fill to 2–4 seats → play.
- **Create room**: pick level + round timer (created rooms only) → share the code → start.

Health check: `GET http://localhost:4100/health` → `{ ok, questions }`.

## Verified locally

- Engine: 35 unit tests green (ranking/tiebreaks, gate, difficulty terciles, XP, standings, bot, round state machine).
- Server: 4 integration tests green (full 3-round match, hint-mode trigger, withdrawal).
- End-to-end: real user → quick-play → bots filled (1 human + 2 bots) → a bot revealed a real player and scored.
- All 10 workspace projects typecheck; the Top Ten web app builds (`next build`) clean.

## NOT done (by design / pending)

- **No production deploy** — awaiting the owner playing the local build first (the single mandatory stop).
- Deferred question types: GK clean sheets (D1, schema/generator ready, dormant), club & national-team (D3, need team-guess UI). Accurate passes is season-gated (D2), kept.
- Register/verify/forgot flows are not re-implemented in the Top Ten web (login reuses existing accounts).
