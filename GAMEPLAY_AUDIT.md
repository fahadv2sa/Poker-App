# Link Up — Gameplay Audit (end-to-end runtime trace)

**Date:** 2026-06-17
**Scope:** Actual runtime flow a real player goes through — server emits **and** client
rendering — lobby → deal → betting → showdown → claim → resolve → next hand.
**Method:**
1. Static read of the full chain: `room.ts` / `socket.ts` (server emits) → `ws.ts`
   (contracts) → `realtime.ts` (socket binding) → `useGameSocket.ts` (state folding)
   → `game-table.tsx` + `parts.tsx` (rendering).
2. **Live runtime trace**: connected two real authenticated sockets to the running
   game-server, played a full check-down hand + the auto next hand, and logged every
   server event + payload each client received (order + contents).
3. DB check of seeded data vs deal requirements.

**Fix status: NOTHING changed.** Read/trace only. The throwaway tracer was removed.

---

## Key result of the runtime trace

The **server emits are essentially correct.** The trace captured, in order, for both
clients: `state:sync` → `hand:started` (with rotated dealer + players) → `game:dealt`
(private hole cards) → `turn:changed` (with a real `deadlineTs` ~60s out) → `bet:placed`
per action → `phase:changed` per street → `showdown:start` **with all 9 ranks and their
Arabic DB names and strengths** → `claim:received` → `game:result` → (5s later)
`hand:started` for hand 2 with **dealer rotated 1 → 2** and first-to-act correctly the
seat after the button.

**Therefore almost every reported problem is a CLIENT rendering / UX-flow gap or a
data/seed problem — not a missing server emit.** Tests pass because they assert the
server emits and the ledger settles; they never render the client, which is exactly
where the live game is broken.

Two server/data exceptions are called out below (insufficient seed; `hand:started`
emitted before antes are posted).

---

## Findings by area

### A. Betting state on the client is corrupted mid-hand  ← biggest functional bug
**Tag: both (server under-informs + client mis-tracks). Severity: CRITICAL.**

Two compounding defects make the client's per-player betting math wrong, which drives
the **owed / call / check / "your bet" / balance** displays and can hard-block a turn:

1. **Antes are never reflected on the client.**
   - `room.ts` posts antes via `applyBetting` (ledger) but emits **no** `bet:placed` for
     them, and `hand:started` is emitted **before** `postAntesAndOpenPreflop`, so its
     `players[*].committedThisRound/Total` are all `0` and the per-seat ante is invisible.
   - Server state after antes: `committedThisRound = 50`, `currentBet = 50` (player may
     CHECK). Client state: `committedThisRound = 0`, `currentBet = 50`.
   - Result preflop: `owed = currentBet − committedThisRound = 50 − 0 = 50`, so the
     ActionBar shows **"مساواة 50" (call 50) when the player has already paid the ante and
     should CHECK.** "رهانك" shows 0 and the header balance is 50 too high.

2. **`committedThisRound` is never reset per street on the client.**
   - `useGameSocket.onPhase` sets `currentBet: 0` on `phase:changed` but does **not** reset
     each player's `committedThisRound` (the server does, via `clearRoundCommitments`).
   - After any preflop **raise/call**, the client's `committedThisRound` stays at the
     preflop total into the FLOP/TURN/RIVER. Then `owed = currentBet − staleCommitted`
     goes wrong (often negative ⇒ a CHECK button is shown when the player actually owes
     money). Clicking CHECK ⇒ server rejects ("illegal check") ⇒ red error toast ⇒ the
     player **cannot complete their turn**. In any hand with a raise, post-preflop betting
     is broken. (The check-only path in the smoke/trace hides this because checks add 0.)

**Likely root cause of several other symptoms:** when betting hard-blocks, players fold
out of frustration → hand ends by last-player-standing → **no showdown → no claim picker**
(see area D).

---

### B. No "ready"/gate before the next hand; antes auto-charged; result vanishes
**Tag: both. Severity: HIGH. (Matches reported #2 and #3.)**

- `room.ts resolveHand` arms a `nexthand` timer (`nextHandDelaySec = 5s`) that calls
  `startNextHand()` automatically; `startNextHand` immediately deals + posts antes.
  There is **no per-player "ready" confirmation** and no host "deal next hand" control.
- Client `useGameSocket.onHandStarted` **clears `result`** (and showdown/hole), so the
  ResultPanel ("انتهت الجولة") disappears ~5s after it appears. Players can't review the
  outcome, and money (antes) is committed to the next hand without consent.
- This is the "permission/ready step before a new hand" that is missing. It was also the
  separately-requested **waiting lobby** feature — still not implemented.

---

### C. Turn timer is effectively invisible; claim phase has no timer at all
**Tag: client (server sends deadlines correctly). Severity: HIGH. (Matches reported #1.)**

- The server sends `turn:changed.deadlineTs` (~60s) and `showdown:start.deadlineTs`
  (verified in trace).
- `parts.tsx TurnTimer` renders only a **1.5px-tall bar with no numeric countdown**, as a
  single element in the **table center** — not on the acting player's seat, and with no
  "whose turn / Ns left" text. It's trivially missed → reads as "no timer."
- It computes `remaining` once and relies on a framer animation; there is **no live
  seconds counter.**
- At **showdown** the bar is hidden entirely: `TurnTimer` is gated on
  `currentTurnSeat != null`, which is `null` during showdown, so the **60s claim timer has
  zero visible indication.** Players don't know claims are time-limited (and that not
  choosing forfeits their stake, decision 19.6).

---

### D. Claim picker (the 9 hand-ranks) — wiring verified; "not shown" is a knock-on
**Tag: server verified working / client wired. Severity: MEDIUM (with real UX gaps). (Reported #4.)**

- **Server:** `showdown:start` is emitted with all 9 ranks (`id`, `code`, `nameAr` from
  the DB, `strength`) — confirmed in the live trace and by the passing e2e smoke
  (concurrent claims round-trip and settle).
- **Client:** `realtime.ts` binds `onShowdown`; `useGameSocket` sets `view.showdown` +
  `phase = SHOWDOWN`; `game-table.tsx` renders `<ClaimPanel>` when
  `phase === "SHOWDOWN" && isContender && view.showdown`. For a non-folder
  (`status ACTIVE/ALLIN`) that condition holds — the picker **should** render for ~60s.
- **So why was it "not shown"?** Most plausible, in order:
  1. The hand never reached showdown — betting bug (area A) forced a fold, or a real fold
     ended it by last-player-standing (decision 19.7 = no claim, by design).
  2. **3+ player games never deal at all** (area F) → no showdown ever.
  3. The picker did show but with **no claim timer** (area C) and an unexplained outcome
     (area E), so it felt non-functional.
- **Real adjacent gaps to fix even though the picker renders:**
  - No visible claim countdown (area C).
  - An **invalid** claim silently resolves to `REFUND`/loss with no explanation in the UI
    (trace: both auto-picked `ROYAL_CLUB` → both `REFUND`, `coinsDelta 0`, no message).
  - `claim:received` is **bound in `realtime.ts` but not handled in `useGameSocket`**, so
    "opponent has chosen" gives no feedback.

---

### E. Result panel shows almost nothing and then disappears
**Tag: both. Severity: MEDIUM.**

- `game:result` carries only `seat / outcome / coinsDelta / finalBalance`. It does **not**
  include what each player claimed, the winning association, or any card reveal, so the
  player can't tell *why* they won/lost. `yourDelta`/`newBalance` are sent as `0`
  (unused; the client recomputes).
- The ResultPanel is then auto-cleared by the next `hand:started` (area B), so there's no
  time to read it.

---

### F. Only 10 players seeded → any game with 3+ seats cannot deal
**Tag: server/data. Severity: CRITICAL for >2 players.**

- `cards.ts` needs `seats * 2 + 5` distinct active players: 2p=9, 3p=11, 4p=13, 5p=15,
  6p=17. DB has **10 active players** (confirmed).
- 2-player games work; **3+ player games throw "Not enough active players to deal
  (10/11)"** on `start()` / every `startNextHand()` → the hand never begins, only a red
  error toast. Rooms default to `maxPlayers = 6`, so this is easy to hit.

---

### G. Whose-turn indicator is weak
**Tag: client. Severity: MEDIUM.**

- Opponent seats get a subtle pulsing border (`animate-turn`) when active; there is no
  "‹name›'s turn" text anywhere, and the center timer bar doesn't name the actor. On your
  own turn the ActionBar appears (clear), but tracking the table's turn is hard.

---

### H. Smaller gaps / SPEC omissions on the table
**Tag: as noted. Severity: LOW–MEDIUM.**

- **All-in side pots not surfaced (client):** the server builds layered side pots, but the
  UI shows only a single `pot` number; an all-in/side-pot situation isn't explained.
- **`sessionWaiting` has no UI (client):** when <2 players can afford the ante the room
  parks to LOBBY and sets `view.waiting`, but nothing renders that state — the generic
  LobbyPanel just reappears.
- **No reconnect/disconnected banner (client):** `onDisconnect` flips `connected` but the
  UI doesn't show "reconnecting"; a dropped opponent isn't surfaced beyond their status.
- **Dealer rotation IS visible** (the "D" badge moves; server rotation verified) — this
  one works; no "next hand starting in Ns" indicator though.
- **Ante not recorded as a visible bet:** related to area A; the SPEC's "mandatory opening
  bet" is correct server-side but invisible client-side.

---

## Cross-check vs non-negotiables / SPEC

- **Server-authoritative:** holds. Out-of-turn actions rejected; identity from token; all
  money server-side. (Verified.)
- **Wallet integrity / ledger / idempotency:** holds (smoke + unit tests; per-hand salted
  references). Not a gameplay-UI issue.
- **Card privacy:** holds — hole cards only via per-seat `game:dealt`, never in broadcasts
  (verified by smoke assertion and trace).
- **Data-driven ranks:** holds — names come from `hand_ranks.name_ar` (verified in trace).
- **SPEC §8/§9 table UX gaps (the live violations):** turn timer not usable (C), claim
  timer invisible (C), mandatory-ante invisible + client betting math wrong (A), no
  player-facing reason for the result (E), 3+ player tables undealable due to seed (F).

---

## Master list — every distinct gameplay problem, most → least critical

1. **Client betting math is wrong mid-hand → can hard-block your turn.** Antes never
   reflected (preflop shows "call 50" when you should CHECK; balance/your-bet off by the
   ante) **and** `committedThisRound` is never reset per street, so after any raise the
   FLOP/TURN/RIVER `owed` goes wrong and a CHECK click is rejected as illegal. **[both]**
2. **3+ player games can't deal** — only 10 active players seeded; need `seats*2+5`
   (3p needs 11). Every start/next-hand throws; only a 2-player table is playable. **[server/data]**
3. **No ready/confirmation before the next hand; antes auto-charged; the result panel
   auto-vanishes after ~5s.** Players are forced into a new hand with money committed and
   no chance to review or leave. (Also: the requested waiting lobby is still unimplemented.) **[both]**
4. **Turn timer is effectively invisible** — a 1.5px bar, no number, in the table center
   (not on the acting seat), no live countdown. **[client]**
5. **No claim timer at showdown at all** — the 60s claim countdown (and the
   not-choosing-forfeits rule) has zero on-screen indication. **[client]**
6. **Claim picker "missing" is a knock-on, not a wiring break** — server emits all 9 ranks
   (verified) and the client renders them for a contender; the picker fails to appear when
   the hand ends by fold (incl. folds forced by bug #1) or never deals (bug #2). Real gaps:
   no claim timer (#5), and invalid claims silently become REFUND/loss with no explanation. **[client UX / scenario]**
7. **Result panel is uninformative** — shows only outcome + delta, never what was claimed,
   the winning association, or any reveal; then it disappears (bug #3). **[both]**
8. **Weak whose-turn indicator** — only a faint pulsing border; no "‹name›'s turn" text. **[client]**
9. **`claim:received` not handled on the client** — no "opponent has chosen" feedback
   (handler is bound in `realtime.ts` but not passed by `useGameSocket`). **[client]**
10. **All-in / side pots not surfaced in the UI** — single pot number only. **[client]**
11. **`session:waiting` (room idle, <2 can ante) renders no message.** **[client]**
12. **No reconnect / disconnected-opponent banner.** **[client]**
13. **Header balance drifts during a hand** (subset of #1: off by the ante / by stale
    committed). **[client]**

---

*End of audit. No code was changed.*
