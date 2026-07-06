# Room-Lifecycle Audit — Link Up / Top Ten / Guess the Player

**Date:** 2026-07-06 · **Scope:** room creation, lobbies, invites, quick play, room types,
every exit path, table fate, and cross-game inconsistencies. Produced after the stale-seat
fixes of this session (Top Ten nonce/join fix + ACTIVE-seats-only finders in Top Ten AND
Guess the Player). All statements verified against the code at this commit range, with the
socket-layer regression suites green (474 tests across 9 packages).

**Fix state going into this audit (all local, uncommitted):**
- Top Ten: create-nonce + invite-code-comparison + ACTIVE-seats-only finder — done, 24/24 tests.
- Guess the Player: ACTIVE-seats-only finder + shadow-bug pinning test — done, 23/23 tests
  (nonce/join fix was already deployed at `1c7e3f4`).
- Link Up: audited, **structurally immune** to the trap family (evidence in §1.9).

---

## 1 · LINK UP (لينك اب) — `apps/game-server` + web REST

### 1.1 Room creation
- **Mechanism:** REST `POST /api/rooms` (web, Auth.js session) → inserts a `Game` row
  (status LOBBY) with an unguessable 8-char invite code. **No socket involvement in create.**
- **Settings:** room name (required, 2–40), public/private, max players 2–8 (default 6),
  difficulty EASY/MEDIUM/ELITE (default MEDIUM). Table config from `DEFAULT_GAME_CONFIG`
  (ante 50, min-raise 50, 60s timers, auto showdown).
- **Creator lands in:** the client navigates to `/table/[gameId]`, which emits `room:join`
  with the room's own invite code → seated in the LOBBY table view.
- **Start:** host-only `game:start`; requires ≥2 connected players; antes charged at deal.

### 1.2 Waiting lobby
- The lobby IS the table page in LOBBY status (`state:sync` snapshots: seats, host seat).
- Host = creator, **with transfer**: if the host leaves, authority moves to the
  lowest-seat still-connected player (`handlePlayerLeft`).
- Host powers: start first hand, deal next hand (`next:hand`), close table (`room:close`).
- No ready mechanic pre-start; between hands there's a 15s ready check (§1.6).

### 1.3 Invites
- Invite link / 8-char room code. No password — a private room is merely unlisted.
- **To a LOBBY room:** seated normally; full → error "Room is full".
- **To a started MANUAL room:** existing member → full rejoin any time while open
  (seat kept, mid-hand hole-card resync). New player → rejected ("Game already started").
- **To a started QUICK_PLAY room:** new human → held as **spectator** and seated at the
  next hand (replacing a bot / free seat) if `canAdmit()`, else ROOM_FULL. A member who
  LEFT → `NO_REJOIN` (Rule 4: quick play forbids re-entry).
- **To a dead room:** `getRuntime` returns null for ABANDONED → `ROOM_NOT_FOUND`.

### 1.4 Quick play
- One FIFO queue per tier; entry gate = wallet ≥ tier ante (50/100/200) — **nothing is
  charged while queued**; first charge is the ante at the first deal.
- All-human path: ≥3 queued arms a 20s fill window; 6 queued starts instantly.
- Bots path (`BOTS_ENABLED`): ≥1 human arms an 8s window with a **cosmetic** count ramp,
  then fills to a randomized 4–6 seats.
- `queue:matched` → clients navigate and join; the server deals after a 4s start grace
  (0 humans arrived → table torn down; <2 connected → deal deferred).
- Quick-play rooms are `kind=QUICK_PLAY`, `isPrivate=true`, never listed in `/api/rooms`.

### 1.5 Room types
- MANUAL public — listed in the rooms browser (`GET /api/rooms`: LOBBY only, newest 50).
- MANUAL private — unlisted; invite link/code only.
- QUICK_PLAY — matchmaking-only; no rejoin; join-after-round spectator path.

### 1.6 Exit behaviors
- **Leave button:** immediate (grace cancelled). Pending spectator → dequeued. Seated →
  `handlePlayerLeft`: `connected=false`; between hands/lobby → parked (WAITING, hand state
  reset); **mid-hand → folded on their turn timeout** (a departed player can never win);
  `player:left` banner; host transfer if needed.
- **Browser back / tab close / navigation:** socket disconnect → **5-min grace**
  (seat held, still "connected", no banner). Reconnect (`room:join` same code) cancels it
  seamlessly. Grace expiry → identical to the leave path above.
- **Network drop:** same as above; socket.io auto-reconnect + a visibility-change nudge.
- **Host leaving:** pre-start alone → table closes (EMPTY). Pre-start or mid-game with
  others → host transfer, play continues. Host close button → live hand **voided +
  refunded** (committedTotal to non-folders, remaining forfeit to folders), game ABANDONED,
  everyone ejected.
- **Winner screen:** 15s ready check. All connected humans ready → next hand immediately.
  **The 15s timer auto-deals regardless of readiness** (see finding L-2).

### 1.7 Table fate
- **Instant close:** host close; last connected HUMAN gone (bots never keep a table alive);
  quick-play start with 0 humans; admin close/kick paths (kick bans rejoin for that room).
- **Linger:** a table with ≥1 connected human lives indefinitely — **no idle-close timer
  exists** (see finding L-3). Below 2 eligible players between hands the session "parks"
  (back to LOBBY status, `session:waiting NEED_PLAYERS`) but stays open while connected.
- **Cleanup:** teardown flips the DB row to ABANDONED and drops the in-memory runtime;
  crash recovery + the daily 04:17 UTC cleanup cron prune DB remnants.

### 1.8 Money on exit (unique to Link Up)
- Mid-hand leaver: folded at their turn timeout → forfeits half the ante/last bet (stays in
  the pot), the rest refunds instantly (Section 19 #3). Close/void → full refunds, no sink.

### 1.9 Trap-family verdict — STRUCTURALLY IMMUNE (Stage 2 evidence)
1. **Create-swallow:** impossible — create is a REST insert of a fresh `Game` row; there is
   no server-side "resync the user's existing room" logic anywhere in `socket.ts`. The
   subsequent `room:join` targets the NEW room's code explicitly.
2. **Join resyncing a stale room:** impossible — `room:join` resolves the room strictly
   from the payload's invite code (`prisma.game.findUnique({ where: { inviteCode } })`);
   there is no fallback to "a room you hold a seat in".
3. **Stale-seat shadowing:** impossible — there is **no user-keyed cross-room finder** at
   all. The only per-user lookup is *inside the target room*
   (`rt.room.state.players.find(p => p.userId === …)`), so a seat in room A (any status)
   is invisible to a join of room B.
4. **Pulled into a started round:** impossible for strangers — `seatPlayer` throws unless
   LOBBY; quick-play live rooms use the pending-spectator queue (seated only between
   hands); member rejoin into a live manual game is deliberate (their own seat).

### 1.10 Link Up findings (no fixes applied — your call)
- **L-1 · Multi-table seating is possible.** Nothing releases an old seat when a user
  deliberately joins/creates another table from a second tab (both sockets stay connected,
  so the grace never arms; the same-socket double-join variant additionally leaves the old
  seat bound to a live socket forever and the old table never auto-closes). TT/GP now
  release the stale seat on any deliberate create/join; Link Up doesn't. Real-client
  reachability: two tabs. Recommendation in §4.
- **L-2 · AFK ante drain.** The 15s winner-screen timer auto-deals even with nobody ready;
  a connected-but-away player keeps paying antes and folding by turn timeout until they
  can't afford the ante (then the session parks). Combined with L-3 this can run a long time.
- **L-3 · No idle close.** GP closes a table after 30 min without human action; Link Up
  (and TT manual lobbies) can idle indefinitely while a socket stays connected.
- **L-4 · English error strings.** `seatPlayer`/`start` throw English messages ("Game
  already started", "Room is full", "Need at least 2 players to start") surfaced verbatim
  as `ACTION_FAILED.messageAr` in an all-Arabic UI.

---

## 2 · TOP TEN (توب 10) — `apps/top-10-server`

### 2.1 Room creation
- **Mechanism:** create form → deep link `/games/top-10/play?create=1&…&n=<nonce>` → the
  play page's socket emits `tt:create`. The **one-time nonce** (new this session) makes a
  URL reload resync the same room while a fresh form submit always opens a fresh lobby.
- **Settings:** difficulty EASY/MEDIUM/HARD, optional room name (2–40), max players 2–4
  (default 4), round timer 1–30 min (default 10), public/private.
- **Creator lands in:** waiting lobby (status LOBBY, roundNo 0) with an invite code.
- **Start:** creator-only for MANUAL rooms; needs ≥2 active seats; 3 rounds per match.

### 2.2 Waiting lobby
- Lobby panel: room name, difficulty, public/private, seat list, invite card + share.
- Creator has the start button (`tt:start`); non-creator start attempts are ignored
  server-side. No ready mechanic pre-start.

### 2.3 Invites
- `/play?join=CODE` or code entry. **To a LOBBY:** seated (FULL at cap).
- **To a started room:** `NOT_FOUND` — join only matches LOBBY rooms. Exception: your OWN
  room's code (returning member) resyncs in any non-abandoned state.
- **Joining a different room while holding a stale seat:** stale seat released first, you
  land in the target lobby (this session's fix).
- **To a dead room:** `NOT_FOUND`.

### 2.4 Quick play
- One queue per difficulty; joining arms an 8s fill window; flush takes up to 4 players.
- <2 humans + bots disabled → keep waiting; bots enabled → fill to a randomized 2–4.
- Match **auto-starts immediately** after fill (no lobby dwell, no invite code → no
  join-by-code and effectively no rejoin after withdrawal).

### 2.5 Room types
- MANUAL public — listed on the rooms browser via `/internal/rooms` (OPEN public LOBBY
  rooms) alongside **live quick-play tables (display-only — they carry no code and cannot
  be joined from the list)**; MANUAL private — invite/code only; QUICK_PLAY — matchmaking.

### 2.6 Exit behaviors
- **Leave button (`tt:leave`):** immediate. LOBBY → seat removed; an emptied lobby is
  dropped instantly. IN_PROGRESS → **withdrawal**: seat status WITHDRAWN, points zeroed
  (منسحب), removed from turn rotation; quick play below minimum → a **bot substitutes** so
  the round finishes with a winner; manual below minimum (or no bot available) → match
  ends abandoned, remaining points zeroed. ENDED (winner screen) → removed from the
  new-round vote; table torn down once no connected human remains.
- **Back / tab close / navigation:** disconnect → 5-min grace in LOBBY and IN_PROGRESS
  (lobby grace exists specifically so a creator sharing the invite link isn't dropped);
  expiry → the withdrawal path above. During ENDED, no grace is armed — the 15s new-round
  window itself resolves the seat.
- **Reconnect within grace:** connection-handler resync (ACTIVE seats only, post-fix) into
  any non-abandoned state; away badge cleared.
- **Creator leaving:** lobby → seat removed like anyone (see finding T-1: no transfer);
  mid-game → normal withdrawal; the close button (`tt:close`, creator-only) works from the
  winner screen (and drops a LOBBY room outright): `tableClosed` to everyone → teardown.
- **Winner screen:** 15s ready vote; all connected humans ready → immediate replay at the
  same table (scores reset, fresh persistence identity, same-question repeats avoided);
  timer fallback restarts only if ≥2 playable seats and ≥1 connected human remain, else
  the room is removed.

### 2.7 Table fate
- Emptied LOBBY → removed instantly (no ghost 0/4 cards in the browser).
- Abandoned mid-match → status ABANDONED, room object deleted after 60s.
- Round timer (≤30 min) always advances a live match; after round 3 → ENDED → 15s vote →
  replay or teardown. Boot-time recovery marks orphaned DB matches ABANDONED; daily
  cleanup cron prunes rows. **No idle close for a MANUAL LOBBY whose seats stay connected**
  (same gap as Link Up, finding L-3).

### 2.8 Top Ten findings
- **T-1 · No creator transfer.** If the creator leaves a lobby that still has joiners, the
  room survives but **nobody can start it** (start is creator-only) — joiners are stuck
  until they all leave (the room then drops when emptied). Same for close rights mid-game
  (lifecycle still ends matches naturally, so impact is lobby-centric).
- **T-2 · Live quick-play tables are listed but unjoinable** (display-only rows in the
  rooms browser). Cosmetic/UX; either hide them or label them as watching-only.

---

## 3 · GUESS THE PLAYER (خمن اللاعب) — `apps/guess-player-server`

### 3.1 Room creation
- **Mechanism:** create form → deep link `/games/guess-player/play?create=1&…&n=<nonce>` →
  `gp:create`. Nonce semantics identical to Top Ten (deployed at `1c7e3f4`).
- **Settings:** mode VS_HUMANS or VS_SYSTEM (difficulty EASY/MEDIUM/HARD required for
  VS_SYSTEM, forbidden for VS_HUMANS), optional room name, max players 2–6, public/private.
- **Creator lands in:** waiting lobby with invite code.
- **Start:** creator-only; ≥2 active seats for manual rooms (solo start is a quick-play-only
  allowance); VS_HUMANS round 1 picker = the creator.
- **Sessions are OPEN-ENDED:** no fixed round count — rounds keep coming, points carry
  over; at table close the unique cumulative leader earns **SESSION_WIN +100**.

### 3.2 Waiting lobby
- Room name, mode chip (ضد الأصدقاء / ضد المنصة + difficulty), public/private chip,
  invite card + share. Creator start button; non-creator starts ignored server-side.

### 3.3 Invites
- `?join=CODE`. LOBBY → seated; started room → `NOT_FOUND` (join matches LOBBY only);
  own room's code → resync any non-abandoned state; different room while holding a stale
  seat → stale seat released, land in the target lobby. Dead room → `NOT_FOUND`.

### 3.4 Quick play
- Per-difficulty queue, 8s gather window, up to 4 seats, **NO bots** (approved decision) —
  after the window the match starts with whoever queued, **including solo** (always
  VS_SYSTEM at quick play). No invite code → no join-by-code, no rejoin after withdrawal.

### 3.5 Room types
- MANUAL public (rooms browser via `/internal/rooms`, hidden player never exposed),
  MANUAL private (invite only), QUICK_PLAY (matchmaking).

### 3.6 Exit behaviors
- **Leave button (`gp:leave`):** immediate withdrawal. LOBBY → seat removed, emptied room
  dropped. IN_PROGRESS → WITHDRAWN + points zeroed; turn order repaired; a picker leaving
  mid-PICKING hands the pick to the next contestant; mid-PLAYING the round continues (the
  SYSTEM answers, not the picker); no contestant left → round ends ABANDONED and the match
  resolves; no connected human left → session closes (abandoned).
- **Winner screen:** 15s countdown — the next match auto-starts for everyone still at the
  table at zero; everyone pressing جولة جديدة starts immediately. The LAST player leaving
  at the winner screen **is** the session close — the full seat list is kept so the
  cumulative leader (possibly the leaver) still earns SESSION_WIN.
- **Back / tab close / network drop:** disconnect → 5-min grace; reconnect resyncs (ACTIVE
  seats only, this session's fix); expiry → withdrawal path.
- **Creator leaving:** lobby → seat removed; empty lobby dropped (finding T-1 applies to GP
  identically — no transfer of start/close rights). Creator close (`gp:close`) works in any
  state: cancels the new-match window when ENDED, `tableClosed` to everyone, teardown.

### 3.7 Table fate
- Emptied lobby → dropped instantly. Abandoned session → closed via `closeSession`.
- **Idle close: 30 min with no HUMAN action** (auto-advancing timers don't count) — the
  only game with this protection. Hidden-player pool exhausted → clean session close.
- Boot recovery + daily cleanup cron as with the other games.

### 3.8 GP findings
- **G-1 = T-1:** no creator transfer (orphaned lobby if the creator leaves with joiners
  present).

---

## 4 · Cross-game inconsistencies & recommendations

| # | Topic | Link Up | Top Ten | Guess the Player | Recommendation |
|---|-------|---------|---------|------------------|----------------|
| 1 | One-table-at-a-time | **Not enforced** — a second tab can seat you in 2+ tables; nothing releases the old seat (L-1) | Enforced (deliberate create/join releases the stale seat) | Enforced (same) | **Align Link Up**: on `room:join` to a DIFFERENT room while seated elsewhere, run the leave path for the old seat first. Small, uses existing plumbing. |
| 2 | Creator/host continuity | **Host transfer** on leave | No transfer → orphaned lobby (T-1) | No transfer (G-1) | **Align TT/GP to Link Up**: transfer creator rights to the lowest-seat member in LOBBY (or dissolve the lobby with a notice). Lobby-only transfer is enough. |
| 3 | Invite to a started room | Member rejoins; stranger blocked (English error, L-4) | `NOT_FOUND` (misleading — room exists) | `NOT_FOUND` (same) | Return a distinct coded error ("المباراة بدأت") in TT/GP; localize Link Up's thrown strings. |
| 4 | Winner-screen replay | 15s **auto-deal** even if nobody pressed ready — real money (L-2) | 15s vote; timer restarts only with ≥1 connected human + ≥2 playable | 15s countdown auto-start | Money makes Link Up the outlier that matters: consider requiring ≥1 explicit ready before an auto-deal charges antes. TT/GP are fine. |
| 5 | Idle close | **None** (L-3) | Bounded mid-match by round timers; MANUAL LOBBY can idle forever | **30-min idle close** | Adopt GP's idle close platform-wide (Link Up tables + TT/Link Up lobbies). |
| 6 | Quick-play re-entry | Explicit `NO_REJOIN` rule + spectate-next-hand for new humans | No code → no rejoin (implicit); live tables listed but unjoinable (T-2) | No code → no rejoin (implicit) | Effectively consistent. Fix T-2 cosmetically (hide or label the listed live quick-play tables). |
| 7 | Reconnect grace | 5 min, all phases | 5 min (LOBBY + IN_PROGRESS; ENDED resolved by vote window) | 5 min | Consistent — no action. |
| 8 | Create duplicate-protection | REST insert (immune by design) | One-time nonce | One-time nonce | Different mechanisms, same outcome — no action. |

**Priority view:** #1 and #4 touch money paths (Link Up); #2 is the most user-visible UX
gap in TT/GP; #5 is hygiene; #3/#6 are polish.

---

*All fixes referenced as "this session" are LOCAL and uncommitted on `feat/guess-player-game`.
Nothing has been deployed. The recommendations in §4 are proposals only — no fixes for
§1.10/§2.8/§3.8 findings have been applied.*
