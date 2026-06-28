# Top Ten (توب 10) — Handoff / Resume Doc

**Last updated:** 2026-06-28 (end of session). **Status:** local build only — **NOTHING deployed to production.**
Both local servers were shut down cleanly at end of session (ports 3100 + 4100 free, no leftover node).

This doc is the single source of truth to resume tomorrow. Read it + `docs/top-10/RUNNING.md` +
the locked decisions below before doing anything. The verified coverage audit lives in auto-memory
(`top-ten-coverage-audit.md`).

---

## 1. What Top Ten is (one paragraph)

Real-time football trivia game = **game #2** on the **Football B** platform, built **inside this repo**
(`link-up`) with its **own `top_10` Postgres schema** and its **own two Railway services** (web + game
server), fully isolated from Link Up. Each round is a "Top 10" stat list (e.g. top scorers, La Liga
2022); players type player names to reveal ranked cards; points = the rank revealed; 3-round matches;
hint/fastest-answer fallback; quick-play matchmaking with bot fillers; created (manual) rooms with no
bots. Visual identity = **copied from Link Up** (gold-on-black), same platform look.

---

## 2. Current state of the build — DONE

- **Schema + migration (DONE):** `top_10` schema in `packages/db/prisma/schema.prisma`, migration
  `20260627190925_add_top_10_game` applied to local DB. Additive only; isolation honored (no cross-schema
  FKs; `user_id`/`football_player_id` are plain UUIDs).
- **Engine (DONE):** `packages/top-10-engine` — pure ranking + 2 tiebreaks, completeness gate, difficulty
  terciles, scoring, XP, standings comparator, bot model, round state machine. **35 unit tests green.**
- **Catalog (DONE):** `pnpm db:build-top10-catalog` → **251 questions** admitted (EASY 84 / MEDIUM 83 /
  HARD 84) + reviewable artifact `docs/top-10/CATALOG.md` + `.json`. Re-runnable; supersedes prior gen.
- **Game server (DONE):** `apps/top-10-server` (:4100, Socket.IO) — full state machine, hint mode,
  withdrawal, persistence to `top_10` only, quick-play bots (reuse Link Up's ≥900000 users, never get XP),
  read-only `/internal/rooms` + `/health`. **4 integration tests green.**
- **Web app (DONE):** `apps/top-10-web` (:3100, Next.js) — own Auth.js vs shared `platform.users` +
  shared `AUTH_SECRET`; pages: `/` (home launcher), `/guide`, `/stats`, `/create-room`, `/rooms`,
  `/play` (quick-play lobby + live match), `/login`. UI package `packages/top-10-ui` holds copied Link Up
  tokens (`tokens.css` = Link Up `globals.css` **verbatim**), gold `lu-icons`, and `lu-screen` chrome.
- **End-to-end verified:** real user → quick-play → bots fill 1 human + 2–4 seats → bot reveals a real
  player and scores; create→list→join loop works; socket connects over **websocket**; all 10 workspace
  projects typecheck; web builds clean (production `next start`).

### In progress / not done (by design)
- No production deploy (awaiting owner to play local build + approve).
- Deferred question types: GK clean sheets (schema/generator ready, dormant); club & national-team
  (need team-guess UI). Accurate passes is season-gated (kept).
- No register/verify/forgot in Top Ten web (login reuses existing accounts).

---

## 3. Open issues — exact status

### ISSUE A — "assist question" impossible values  →  **DIAGNOSED + FIXED (label), data verified correct**
- **Report:** "تمريرات حاسمة — دوري أبطال أوروبا 2020" showed Gómez 30, Cuadrado 25, Valbuena 24;
  flagged as wrong column/scope (assists are single digits).
- **Finding (verified against raw DB):** NOT a wrong-column/scope bug. These are genuine UCL 2020-21
  **key passes** (Kroos 25, Kimmich 25, Cuadrado 25 — 1 row each; De Bruyne 17; Modrić 18). The `#1`
  "P. Gómez 30" = Papu Gómez, a legit two-club transfer that season (`15 Atalanta + 15 Sevilla`).
  Column→type mapping audited for ALL types — correct (goals_total / goals_assists / passes_key /
  tackles_total / passes_total×accuracy).
- **Root cause:** the **Arabic label** for `KEY_PASSES` was "تمريرات حاسمة" (reads as *assists*), so 25
  looked impossible. **FIXED** → "تمريرات مفتاحية" (key passes) in `@fb/shared` `TT_TYPE_META`. Catalog
  rebuilt (identical data, confirming no corruption). **Verdict: resolved.** If the owner still considers
  it open, the only remaining sub-question is whether to keep summing a player's two-club season total
  (currently yes — that's the correct competition-season total).

### ISSUE B — button-response lag  →  **DIAGNOSED + FIXED**
- **Causes found (client only; server hot path is clean — pure engine per event, fire-and-forget
  persistence, no DB/scan, debounced search):** (1) running `next dev` (heavy); (2) a 500ms full-subtree
  re-render storm from `useCountdown` at the top of the match view; (3) **missing Link Up's global
  tactile-press feedback** (lobby tiles using `.lu-frame` had no `:active` response → felt laggy);
  (4) 10 cards each rendering an expensive `.lu-frame` masked-gradient border.
- **Fixes applied:** switched to **production build** (`next start`, `.next` junctioned outside OneDrive);
  isolated the countdown into a self-ticking `<Countdown>`; memoized `PlayerSearch` + stable callbacks;
  added Link Up's **global tactile-press rule** (now in the copied tokens); lightened the card grid.
  **Verdict: addressed.** Re-confirm feel tomorrow; if any specific interaction still lags, profile it.

### ISSUE C — match all Link Up pages 100% (except the game table)  →  **LARGELY DONE; needs visual QA pass**
- **Done:** `packages/top-10-ui/src/tokens.css` = Link Up `globals.css` **verbatim** (only the 2 leading
  `@import`s stripped) — `.lu-frame`/`.panel`/`.btn-gold-cta`/`.section-ico`/all keyframes/tactile rules
  confirmed in the shipped CSS. Copied `lu-icons` + `lu-screen` (`LuScreen`/`LuHeader`/`LuPanel`).
  Rebuilt every page on that chrome: home launcher, guide (tap-to-reveal cards), create-room (option
  cards + `btn-gold-cta`), rooms (JoinForm + two-tab RoomBrowser), stats (tiles + level hero), quick-play
  lobby + waiting lobby (count/max, seat dots, countdown, "مغادرة الطابور").
- **Pending:** a **side-by-side visual QA pass** vs Link Up to catch any residual pixel differences
  (the home `TenHome` is a faithful re-implementation of `LinkUpHome` but was not diffed element-by-element;
  the `/play` wrapper uses the home-style `Atmosphere` rather than `LuAtmosphere` — minor). The **live
  game table is intentionally allowed to differ** (gameplay differs).

---

## 4. Deferred-fixes log (D1–D8) — updated

- **D1** — GK clean sheets: no data; schema + generator **built ready/dormant**, activates if a
  `clean_sheets` column is imported. (open, by design)
- **D2** — Accurate passes: season-gated by the completeness gate; **kept**, auto-expands as data improves.
- **D3** — Club & national-team question types: deferred to a later **team-guessing UI** version.
- **D4** — "successful tackles" → only total tackles exist; relabeled "most tackles". (done)
- **D5** — Historical roster-completeness is unmeasurable from inside → gate is a proxy; owner reviews the
  generated catalog artifact as the real gate; thresholds are tunable config in `@fb/shared` `TT_GATE`.
- **D6** — Completeness-gate threshold sensitivity → uses regulars-fill metric + tunable thresholds +
  reviewable `docs/top-10/CATALOG.md`. (done)
- **D7** — UI reuse → copied Link Up tokens/icons/chrome into `packages/top-10-ui` + `apps/top-10-web`;
  Link Up never modified. (done)
- **D8** — Cross-service auth → Top Ten web runs its own Auth.js vs shared `platform.users` + shared
  `AUTH_SECRET`. (done)
- **D9** *(new)* — KEY_PASSES label "تمريرات حاسمة"→"تمريرات مفتاحية" (was misread as assists). (done)
- **D10** *(new)* — Link Up 100% visual match: tokens/chrome/pages done; **side-by-side QA pass pending**.

---

## 5. Locked decisions (do NOT re-litigate)

- In-repo build; new `top_10` schema; **own two Railway services** (web + game-server), separate from Link
  Up. Isolation: no cross-schema FKs; reference identity by opaque `user_id`; football data read-only via
  the catalog seam.
- **XP:** round = points × {EASY 1.0 / MED 1.5 / HARD 2.0} + tail {#8 +5, #9 +10, #10 +15}; match-win +50;
  **no runner-up bonus**. Difficulty = Σ-fame **terciles** (high Σ = easy).
- **Bots:** quick-play only; reuse Link Up's ≥900000 users; fill to randomized **2–4** seats; never get
  XP/progression. p = 0.4 + 0.5·skill; rank-weighting `r^((2s−1)·2)`.
- **Rules:** 3 fixed rounds; 30s turns; two-scoreless-rotations → hint mode (10s lock → 30s window →
  ≤3 hints then auto-reveal 0 pts); withdrawal loses all points ("منسحب"); created rooms = no bots.
- **Visual identity:** copy Link Up's gold-on-black system; **never modify Link Up** (only the one allowed
  edit: its `games.ts` registry entry, already flipped to live). The **game table** is the only screen
  allowed to differ.
- **Local run = production build** (`next start`), `.next` junctioned outside OneDrive to avoid sync locks.

---

## 6. Exact steps to start the local build tomorrow

Prereq: local Postgres running with the football data (same DB as Link Up). Repo root:
`C:\Users\Admin\OneDrive\Desktop\Football-B\link-up`.

```powershell
# (only if the DB was reset) rebuild the question catalog once:
cd C:\Users\Admin\OneDrive\Desktop\Football-B\link-up
$env:NODE_OPTIONS="--use-system-ca"; pnpm db:build-top10-catalog

# Terminal 1 — game server (:4100). Wait for "Top Ten server listening on :4100".
cd C:\Users\Admin\OneDrive\Desktop\Football-B\link-up
pnpm dev:top10-server

# Terminal 2 — web app (:3100). Production build is snappier than dev:
cd C:\Users\Admin\OneDrive\Desktop\Football-B\link-up\apps\top-10-web
pnpm build
node node_modules/next/dist/bin/next start -p 3100
#   (or, for hot-reload while editing: pnpm dev:top10-web)
```

Then open **http://localhost:3100**, log in with an existing Football B account.
Verify health first: `http://localhost:4100/health` → `{"ok":true,"questions":251}`.
The socket should connect over **websocket** (DevTools → Network → `socket.io` shows 101); if you see
`xhr poll error`, the server (Terminal 1) isn't up — both must run together.

Useful: `pnpm -r typecheck`; engine/server tests: `pnpm --filter @fb/top-10-engine --filter @fb/top-10-server test`.

---

## 7. NEXT SESSION KICKOFF — copy-paste this at the start of tomorrow's session

> **Top Ten — resume.** We're continuing the Top Ten game (game #2 on the Football B platform, built
> inside the `link-up` repo, local only — nothing is deployed). Last session: schema/engine/catalog/
> server/web are all built and verified locally; the whole UI was rebuilt to copy Link Up's gold-on-black
> identity. Both local servers were shut down cleanly.
>
> **Before doing ANYTHING:** read `docs/top-10/HANDOFF.md` in full (especially §5 "Locked decisions" and
> §3 "Open issues"), plus `docs/top-10/RUNNING.md` and the auto-memory `top-ten-coverage-audit.md`. Do not
> re-litigate locked decisions.
>
> **Open issues, in priority order:**
> 1. **Assist-question data bug** — re-verify the fix (it was diagnosed as a label bug, not a data bug:
>    KEY_PASSES was mislabeled "تمريرات حاسمة" → now "تمريرات مفتاحية"; raw values are correct key passes).
>    Confirm I'm satisfied it's resolved, or investigate the remaining sub-question (two-club season-total
>    summing).
> 2. **Button-response lag** — re-confirm it feels snappy now (fixes: production build, isolated timer,
>    memoized search, Link Up's global tactile-press, lighter cards). If any specific interaction still
>    lags, profile that one.
> 3. **Link Up 100% styling match** — do a side-by-side visual QA pass of every Top Ten page vs Link Up
>    (home, guide, create room, join room, stats, lobbies, headers, nav) and fix any residual differences.
>    The live game table is the ONLY screen allowed to differ.
>
> **Standing rules (in force):** read before acting; do not assume; stop and ask on any ambiguity; never
> deploy to production without my explicit approval (after I've played the local build); keep the
> deferred-fixes log (D1–D10) updated.
>
> **Start the local build first (two terminals):**
> ```powershell
> # Terminal 1 (game server :4100)
> cd C:\Users\Admin\OneDrive\Desktop\Football-B\link-up
> pnpm dev:top10-server
> # Terminal 2 (web :3100)
> cd C:\Users\Admin\OneDrive\Desktop\Football-B\link-up\apps\top-10-web
> pnpm build; node node_modules/next/dist/bin/next start -p 3100
> ```
> Then open http://localhost:3100 (verify http://localhost:4100/health → 251 questions first).
> If you can start the servers yourself in the background, do so and give me the link.
