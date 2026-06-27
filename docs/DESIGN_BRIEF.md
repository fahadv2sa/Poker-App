# Football B — Visual Redesign Brief

> **Status:** design-direction brief. No implementation yet. Nothing in this document
> describes or defends the *current* look — the current visual layer is being discarded
> entirely. This brief defines what the screens must *do and say*, and hands the
> aesthetic over to an external design tool with full creative freedom.

---

## 0. How this brief is meant to be used (the pipeline)

**Tooling:** a two-stage pipeline.

1. **Midjourney v7 (or equivalent image model) — VISUAL DIRECTION.**
   Generate the art direction: mood, palette, lighting, material/texture language,
   typographic feeling, the overall "premium football-game" aesthetic. Produce several
   concept frames per screen archetype (the table, the home/play screen, a player card).
   *This is the stage the product owner curates personally — it is pure taste.*
   Midjourney cannot render Arabic and invents layouts, so its output is **mood only**,
   not a literal screen.

2. **v0 by Vercel — STRUCTURED SCREENS.**
   Take the *chosen* Midjourney direction plus the real Arabic copy and real data in this
   brief, and generate concrete RTL, Arabic, dark, mobile screens that realize that look —
   something judgeable and implementable.

3. **Re-implementation (done in-repo, by hand).**
   The generated output is a **visual target only**. It is re-built natively in the
   project's own component system. **Idea in, pixels out — never the tool's code in.**
   No tool JSX, no tool CSS/config, no tool color values are pasted into the repo.

**Therefore:** the tools are free to be as ambitious as they like. They are not
constrained by what can be "cleanly merged" — implementation is a separate, manual step.

---

## 1. The only fixed constraints (everything else is open)

These three are **product structure, not aesthetics**. They cannot change:

1. **Arabic, first-class.** All copy is Arabic. Use the exact strings in this brief.
2. **RTL layout.** The first element sits on the **right**; everything is mirrored.
3. **Mobile-first phone frame, dark theme.** It's an installable PWA. Design at a
   phone width (~390–430px); content reads as a single centered column. Dark UI.

**Everything else is a blank canvas — full creative freedom:**
color palette, typography/typeface, logo & brand mark, iconography, lighting, depth,
texture, materials, motion, spacing, shape language, the entire aesthetic. There is **no
brand palette to honor and no existing tokens to match.** If a different color world,
a different type system, or a different visual metaphor serves the product better, use it.
Push it to the highest end you can reach. Replace the emoji currently used as icons with
real, designed iconography or artwork.

---

## 2. Product context (so the direction is informed, not generic)

- **Football B (فوتبول بي)** is a **multi-game platform** for Arabic-speaking football fans.
  After login, a **hub** lets the user pick a game.
- **Game #1 is Link Up (لينك اب):** an online multiplayer card game with a Texas-Hold'em
  *structure* (rooms, betting rounds, community cards, a showdown) but where winning is
  based on **football knowledge** — cards are real footballers, and "hands" are formed by
  relationships between them (same nationality, same position, shared clubs).
- The cards are **real players with photos** (e.g. Messi, Ronaldo). The product wants to
  feel like a **premium, competitive, fun football game** — closer to a polished sports /
  card game than to a finance app or generic SaaS dashboard.
- Audience is mobile-first, Arabic, and enjoys spectacle (a hand reveal, a winner moment,
  a stadium feeling). It should look exciting and high-end, not utilitarian.

There is no fixed mascot, logo, or color identity yet — **inventing a strong one is part
of the job.**

---

## 3. Global spec the tool must respect on every screen

```
LANGUAGE   Arabic, real strings provided. Numbers in Latin digits (0–9), kept as an
           LTR run even inside Arabic (money, counts, ranks, codes, timers).
DIRECTION  RTL. First child = rightmost. Mirror all rows, nav, and alignment.
THEME      Dark only.
FRAME      Phone (~390–430px). Single centered column. Installable PWA — assume the top
           edge may sit near a status bar/notch (leave safe breathing room top & bottom).
MOTION     Free to design. Must degrade gracefully for "reduced motion" users (calm,
           non-animated fallback). Nothing essential may depend on animation.
TYPE       Free choice of Arabic typeface(s) — pick something that reads as premium and
           modern, with a strong display weight for headings/numbers.
```

What the tool is explicitly invited to reinvent: the brand mark/logo, the full color
palette, all iconography (no emoji), the "table/felt" metaphor for the game screen, card
design, winner celebration, and the motion language.

---

## 4. Per-screen spec format (template)

Each screen below follows this shape:

```
SCREEN — route
PURPOSE        one line: what the user does here.
FRAME          device/layout notes.
REGIONS        top → bottom; within each region, elements right → left (RTL).
ELEMENTS+COPY  every element, with the exact Arabic string and the live data it shows.
DATA/STATES    dynamic values (with example), and the states the design must survive
               (empty, loading, long name, big number, error…).
PRODUCT TRUTH  the few facts the layout must convey — these can't be designed away.
FREE TO REINVENT  where to go premium (this is most of it).
```

---

## 5. Starting screens (do these three first — they define the system)

Order of impact: **(1) the live table** sets the whole game's identity, **(2) the Link Up
home** is the play hub, **(3) the platform hub** is the front door.

---

### SCREEN A — Live Game Table · `/table/[gameId]`

**PURPOSE:** The actual game. Players sit around a table, see community cards + their own
two cards, bet across rounds, and watch the winner reveal. This is the crown jewel — it
should feel like sitting at a premium football card table.

**FRAME:** Full-screen, no page scroll during a hand. Header pinned top, play area in the
middle, action controls pinned bottom. (On wide screens it may breathe wider, but design
phone-first.)

**REGIONS (top → bottom):**
1. **Minimal top bar** — during play this is intentionally sparse: a sound/mute control,
   a host-only "close table" control, and an "exit" control.
2. **Opponents ring** — up to 5 opponents arranged along the top arc of the table.
3. **The table surface** — currently themed as a football pitch; holds the pot, the 5
   community cards, the turn timer, and floating notices.
4. **Your hole cards** — your two cards, sitting at your edge of the table (larger than
   the board cards).
5. **Your seat HUD** — your balance, your avatar+name, your session net profit/loss.
6. **Action zone** — context-dependent: lobby (invite + start), your-turn controls, or a
   waiting hint.
7. **Overlays** (full-screen, on top): the round result/winner screen, the player-card
   detail modal, the end-of-session table summary.

**ELEMENTS + COPY (exact Arabic):**

- **Top bar:** mute toggle · host-only `إغلاق الطاولة` (confirm: `تأكيد الإغلاق` / `إلغاء`)
  · `خروج` (confirm: `تأكيد المغادرة`).
  - Leaving mid-hand warning banner: `إذا غادرت الآن ستترك يدك الحالية، وتبقى رهاناتك ضمن المجمّع (لا تُسترد)، ويُسقَط مقعدك من اليد التالية.`
  - Leaving between hands: `هل تريد مغادرة الطاولة والعودة إلى القائمة؟`
- **Connecting state:** `جارٍ الاتصال بالطاولة…`
- **Opponent seat** (repeats up to 5; empty state: `بانتظار لاعبين آخرين…`):
  - avatar (real photo or generated fallback), display name
  - status label: `يلعب…` (active) / `بالانتظار` / `منسحب` / `كل الرصيد` / `غير متصل`
  - committed chips: a coin glyph + number (e.g. `🪙 150`)
  - **dealer marker** "D"
  - **on their turn:** a prominent "now playing" highlight + a live countdown on the seat
  - **transient action cue** that briefly takes over the seat: `مرّر` (check) / `ساوى`
    (call) / `رفع` (raise) / `كل الرصيد` (all-in)
  - **folded:** a struck-through / stamped `انسحب` look
- **Pot scoreboard (center of table):** label `المجمّع` + the pot amount (big number).
  When there's a live bet: `الرهان <N>`. Side pots when an all-in splits: `المجمّع الرئيسي`
  and `جانبي 1`, `جانبي 2`… each with an amount.
- **Community cards:** a row of **5** cards (face-up as the hand progresses; face-down
  before). See **Player Card anatomy** below.
- **Turn timer:** a live countdown, e.g. `⏱ 45 ث`, with a draining bar; turns red in the
  last ~10 seconds.
- **Your hole cards:** label `بطاقتاك` · dealer "D" if you're dealer · your stake
  `· رهانك 🪙 <N>` · then your **two** cards (larger).
- **Your seat HUD (a flanked trio):** `رصيدي` + coin glyph + balance (treated as the
  "money/gold" tone) — your avatar + name + `دورك…` when it's your turn — `صافي` + your
  session net with an up/down indicator (▲ positive / ▼ negative).
- **Action zone — Lobby (before the hand):**
  - waiting: `بانتظار انضمام لاعبين (أو إعادة شحن الرصيد) لبدء جولة جديدة…`
  - **Invite card:** badge `كود الدعوة` · the invite code (short, prominent, e.g. `7K3QP`)
    · helper `ادعُ أصدقاءك بالكود أو شارك الرابط مباشرة` · button `مشاركة الدعوة`
    (after copy: `تم نسخ الدعوة ✓`)
  - host start button: `ابدأ اللعبة` (enabled) / `بانتظار انضمام لاعب…` (disabled)
  - non-host: `بانتظار أن يبدأ المضيف اللعبة…`
- **Action zone — Your turn:**
  - header `دورك` · amount owed `للمساواة: 🪙 <N>` or `لا رهان مستحق`
  - buttons: `تمرير` (check) / `مساواة <N>` (call) / `كل الرصيد` (all-in) / `انسحاب` (fold)
  - raise: an amount input (`الحد الأدنى <N>` placeholder) + `رفع إلى <N>`
  - fold confirm: `هل تريد الانسحاب؟ ستخسر 🪙 <N> عملة ويُعاد لك باقي رهانك. المؤقّت مستمر.`
    + `تأكيد الانسحاب` / `إلغاء`
- **Action zone — Waiting hint:** `الدور على <اسم>…` / `بانتظار الجولة…` /
  `بانتظار اختيارات اللاعبين…`
- **Player Card anatomy (the football card — design this lovingly):**
  - face: player **photo** (top, dominant) → English name → Arabic name → club, with a
    **fame score** badge (a ★ + a number 0–100). A legendary player (score ≥ 100, e.g.
    Messi) gets a special standout treatment. Face-down cards need a distinct "card back".
  - tap to expand → **detail modal:** large photo, full Arabic + English names, fame score,
    and (on the result screen) nationality `الجنسية`, position `المركز` (values:
    `حارس مرمى` / `مدافع` / `وسط` / `مهاجم`), and career history `مسيرة الأندية` (a list of
    clubs). Fallback when no photo: player initials on a gradient.
- **Round result overlay (full-screen, the celebration moment):**
  - ready row: `الاستعداد للجولة: <ready>/<total>` + a countdown
  - controls: `جولة جديدة` (→ `جاهز` once pressed) · host-only `اغلاق الطاولة` · `الخروج`
  - **winner block:** trophy treatment, heading `الفائز` (or `الفائزون` if multiple),
    then per-winner cards
  - **draw block** (no winner): `تعادل!` + `لا فائز — استُردّت المساهمات.`
  - **per-player result card:** avatar · name (yours shows `أنت`) · the hand/rank name
    (Arabic, from data — e.g. `رويال الجنسية`, `فل هاوس`, `زوج`) · a ★ "players power"
    score · which pot(s) won · the net coins (`+120` / `−50`). Expand → the combination
    cards, the money math `دفع <x> • ربح <y> • صافي <z>`, and a plain-language "why".
  - outcome tags: `فائز` / `تقاسم` / `خاسر` / `منسحب` / `استُردّ`
  - your private best hand: `أقوى ترابط لديك` (or `لا ترابط مكتمل`)
- **Table summary (end of session):** title `ملخص الطاولة`, a collapsed card per round
  (`الجولة <N>`), each expanding to that round's result.

**DATA / STATES the design must survive:**
- 2 to 6 players (1–5 opponents). Long Arabic names (truncate gracefully).
- Big numbers (balances/pots into the tens of thousands).
- Many simultaneous states on one seat (active + dealer + all-in + committed chips).
- The 9 hand-rank names are **data-driven** (come from the server) — don't hardcode them.
- Reduced-motion users must get a calm version of every animated moment (reveal, winner).

**PRODUCT TRUTH (must convey, can't be designed away):**
- Whose turn it is, the pot size, the amount owed, and each player's status must be
  unmistakable at a glance — this is a real-time betting game.
- A player's two hole cards are **private** until the official reveal.
- The winner reveal must clearly show **who won, with which footballer combination, and
  how much** — the "why" is the whole point of the game.

**FREE TO REINVENT:** the entire table metaphor (it need not be a football pitch), the
card design, the chips/coins language, the seat treatment, the pot/scoreboard, the timer,
the winner celebration, and all motion. Make it feel like a premium football game.

---

### SCREEN B — Link Up Game Home · `/games/link-up`

**PURPOSE:** The game's launch screen. The player starts a quick match, creates or joins a
room, or jumps to stats/bank/guide.

**FRAME:** Single centered phone column. A pinned bottom navigation bar.

**REGIONS (top → bottom):**
1. Brand bar — game logo + the name `لينك اب`.
2. A central **primary action** (the headline call-to-action of the screen) flanked by
   secondary actions.
3. A "global rank" strip.
4. Pinned bottom nav.

**ELEMENTS + COPY (exact Arabic):**
- Brand: a Link Up logo/mark + `لينك اب`.
- **Primary action — Quick Play:** the dominant, can't-miss element. Label `اللعب السريع`
  (currently paired with a ⚡). This is the single most important button on the screen.
- **Four secondary actions** flanking it: `إنشاء غرفة` (create room), `دخول غرفة` (join
  room), `الإحصائيات` (stats), `البنك` (bank).
- **Global rank strip:** label `الرانك العام` + the player's rank as `#<N>` (e.g. `#128`) —
  a premium / "trophy" feel.
- **Bottom nav (3 items):** `دليل اللعب` (guide), `الرئيسية` (home → the platform hub),
  `الإعدادات` (settings/profile).
- **Modals that can appear here:**
  - level-up celebration: shows the new level and the new daily bank amount.
  - one-time "add to home screen" reward (shows in browser; grants coins).
  - "room closed" notice (when returned from an abandoned table).

**DATA / STATES:**
- Rank is dynamic (`#1` … `#9,999`). Handle large ranks and `#1`.
- The level-up and install-reward modals are occasional, not always present.

**PRODUCT TRUTH:**
- Quick Play is the primary path and must read as the clear hero action.
- This screen is **game-scoped** — no platform identity here (avatar/likes/friends live on
  the hub). Coins/balance live on the Bank screen, not here.

**FREE TO REINVENT:** the hero treatment (it needn't be a circular "orb"), the layout of
the secondary actions, the rank strip, iconography, and the bottom nav style.

---

### SCREEN C — Platform Hub · `/`

**PURPOSE:** The front door after login. Shows the player's identity and lets them pick a
game.

**FRAME:** Single centered phone column, vertically scrollable.

**REGIONS (top → bottom):**
1. Top bar — platform logo + name `فوتبول بي` (right) · sound toggle + overflow menu (left).
2. Identity card — avatar, display name, and two social stats.
3. Section heading `اختر لعبة`.
4. Games grid — a 2-column grid of game cards.

**ELEMENTS + COPY (exact Arabic):**
- Brand: a Football B logo/mark + `فوتبول بي`.
- Overflow menu (⋯): contains at least a sign-out action.
- **Identity card:** avatar (uploaded photo, or a generated fallback from the name's first
  letter), display name, and two stats: `إعجاب` (likes received, a count) and `الأصدقاء`
  (friends count; tapping it goes to the friends screen).
- **Section heading:** `اختر لعبة`.
- **Game cards (4):**
  - `لينك اب` — **live** — call-to-action `العب الآن`
  - `توب 10` — coming soon — badge `قريباً`
  - `خمن اللاعب` — coming soon — badge `قريباً`
  - a 4th placeholder — coming soon — badge `قريباً`
  - Live cards are tappable; "soon" cards are visibly disabled placeholders (they advertise
    the future line-up on purpose).

**DATA / STATES:**
- Avatar present vs. generated fallback. Long display names (truncate).
- Counts can be large (e.g. `1,284`).
- Exactly one live game today; the other three are intentional "soon" placeholders.

**PRODUCT TRUTH:**
- The hub is **identity-only** — no coins, no level, no per-game economy here (those live
  inside each game). It's the shared front door across all games.
- The four-card line-up (1 live + 3 soon) is intentional and should stay four.

**FREE TO REINVENT:** the game cards as premium game tiles (art, depth, motion — not flat
boxes), the identity card, the iconography (replace emoji), and the whole color/type world.

---

## 6. The rest of the screens (same system, do after the three above)

Once the direction is locked on A/B/C, these inherit it. Listed so the system is complete;
full specs to follow when we reach them.

- **Auth flow:** `/login`, `/register`, `/forgot`, `/reset-password`, `/reset-verify`,
  `/verify` — username/password + email verification + password reset. Premium dark forms,
  RTL, Arabic, with the new brand mark.
- **Lobbies:** `/quick-play` (matchmaking: pick a difficulty tier, see a live player count
  and countdown), `/create-room` (room setup form), `/rooms` (browse/join rooms by code).
- **Economy & profile:** `/bank` (request coins, daily limit), `/rank` (leaderboard),
  `/stats` (level/XP, badges, totals), `/profile` (edit nickname + avatar),
  `/friends` (requests + list), `/guide` (how to play + the 9 hand ranks).

(Admin screens under `/admin/**` are internal tooling — out of scope for this redesign.)

---

## 7. Keeping the screens consistent (one design language)

To avoid each generated screen looking like a different product:

1. **Lock the direction once.** Use Midjourney to settle ONE art direction (palette, type,
   lighting, shape, the card look) on screens A/B/C before generating any others.
2. **Extract a token set from the chosen direction** — a named palette (with whatever the
   new "money/win/danger" accents become), a type scale, spacing/radii, and the card +
   button + panel treatments. Every later screen is generated against that same token set.
3. **Reuse archetypes**, don't reinvent per screen: one card style, one button family, one
   panel/surface, one avatar treatment, one "coin/number" style, one empty-state style.
4. Feed v0 the **same direction summary + token set** in every prompt, plus that screen's
   spec from this brief, plus an instruction: *Arabic, RTL, dark, mobile, use these exact
   strings, use this palette and these components.*

When a direction is approved, the token set it implies will be defined here (Section 8) and
becomes the contract the native re-implementation is built to.

## 8. Chosen direction & tokens

**Status: LOCKED for the table screen (2026-06-26).** This is the master visual world.
Every other screen inherits it — same palette, same gold-on-black luxury, same fire-gold
accents, same card and icon language. Source: the approved Midjourney "luxury card lounge"
frame (Variant 2 → Take 1 refinement). Token values below are **extracted by eye from a
mood frame** and are the design *intent*; exact hex/oklch is finalized during native
re-implementation, but the relationships (warm near-black base, metallic gold, ember-orange
fire accent, cream text) are fixed.

### 8.1 The world in one line
Opulent **gold-on-black luxury**, cinematic low-key lighting, molten cracked-gold material,
a **gold-and-fire** hero motif, FUT-premium collectible-card craft. Expensive, dramatic,
confident. Never flat, never cheap, never cartoonish.

### 8.2 Palette (approximate — relationships are what's fixed)

```
BASE / SURFACES (warm near-blacks)
  --bg-abyss      #07060A   page base, darkest
  --bg-base       #0E0C0B   primary surface (warm black)
  --bg-raised     #16130F   panels / cards interior
  --surface-molten         dark charcoal with molten cracked-gold veining + deep shadow
                           (texture, used sparingly behind hero moments)

GOLD (the brand metal — use as gradients, not flat fills)
  --gold-hi       #F2D27A   highlight / top of metal bevel
  --gold          #C9962E   primary gold (frames, key accents, rank)
  --gold-deep     #8A6A20   shadow side of the metal
  --gold-line     rgba(201,150,46,.35)   hairline dividers, card edges

FIRE / EMBER (the energy accent — the "alive" color, used for the hero + emphasis)
  --ember         #FF6A1A   primary fire accent
  --ember-hot     #FFB347   glow / spark highlights
  --ember-deep    #B23A12   shadowed flame

TEXT
  --text          #F3ECDD   primary, warm cream-white
  --text-muted    #B9A879   secondary, tan/old-gold
  --text-faint    rgba(243,236,221,.45)

SEMANTIC (kept inside the world)
  --win / positive   gold→ember warm glow (a "trophy" feel, not generic green)
  --lose / negative  #C0392B  ember-red (reads as danger, stays warm, not pure red)
  --legendary        solid gold standout w/ stronger ember glow (e.g. Messi ≥100)
```

> Note: this **replaces** the old mint/cyan/navy palette entirely. The new accent energy is
> **ember-orange + gold**, not mint. "Win/positive" becomes warm gold rather than green.

### 8.3 Typography (feel)
- **Display / numbers / ratings:** a bold, slightly **condensed** sporty face — the FUT
  rating/stat feel. Heavy weight, tight tracking, tabular numerals. Used for big numbers
  (pot, balance, ratings, rank `#`), headings, and card stats.
- **Arabic UI:** a **premium, modern, high-contrast Arabic display typeface** with a strong
  heavy weight available for headings and a clean readable weight for body — confident and
  expensive, not utilitarian. (Final face chosen at implementation; must support a true
  heavy display weight.)
- **Numerals stay Latin** (0–9), in an LTR-isolated run inside Arabic, tabular.

### 8.4 Card frame style (the FUT-premium player card)
- Vertical trading card, **metallic gold frame** (gradient bevel: `--gold-hi` → `--gold` →
  `--gold-deep`), dark interior (`--bg-raised`), subtle holographic/specular sheen.
- Anatomy: **portrait** dominant up top; a left column with **rating number** (big,
  condensed gold), **position**, **country flag**; **club crest**; a **stat grid** in gold;
  **name plate** at the bottom. Legendary players get a brighter gold + ember glow.
- Card **back**: dark with a gold molten-crack pattern + the brand mark.
- This same frame language scales down to game tiles, badges, and result cards.

### 8.5 Lighting & material
- **Single warm key light** centered (motivated by the fire), deep falloff to near-black
  edges, strong **vignette**. High contrast, low-key, cinematic.
- **Molten gold cracks** + faint **ember particles/sparks** as the signature texture —
  concentrated at the hero, sparse elsewhere so the UI stays legible.
- Gold reads as **real metal**: bevels, specular highlights, reflections — never flat.
- Glassy/obsidian sheen on dark panels; soft inner highlight on raised surfaces.

### 8.6 Shape, spacing & layout feel
- **Framed composition:** content in a centered column with a dark vignetted border, like
  a premium game HUD.
- **Rounded panels** (generous radius), separated by **thin gold hairline dividers**.
- Dense-but-organized "control panel" rhythm in the lower half; the hero gets breathing
  room and the brightest light.
- **RTL** throughout (first element rightmost), mobile portrait, dark.

### 8.7 Iconography
- **Circular gold-rimmed icons**, dark fill, arranged in a clean bottom bar / top bar.
- A single coherent custom set — **no emoji**. The coin/currency mark is a gold token;
  rank is a gold trophy/crest; the "fire-gold football" is the signature brand motif and
  the natural Quick Play / play emblem.

### 8.8 Signature motifs to carry across every screen
1. The **gold-and-fire football** (hero centerpiece / play emblem).
2. **Molten cracked-gold** texture on dark (used sparingly).
3. **Metallic gold frames** (cards, key panels, the rank strip).
4. **Ember-orange** as the one energetic accent against gold + black.
5. **Cinematic low-key vignette** framing.

### 8.9 Approved screen references
- **Table** (`/table`) — LOCKED 2026-06-26. The parent frame; defines all tokens above.
- **Link Up home** (`/games/link-up`) — LOCKED 2026-06-26. Confirms inheritance: a
  gold-and-fire football hero up top, brand bar, stacked menu/control panels with gold
  hairlines, a grid of circular gold icons, a play control, and a bottom gold icon nav —
  reads as the same world as the table. This is the reference for menu/list-style screens.
- **Games hub** (`/`) — LOCKED 2026-06-26. Top brand bar + compact identity chip; a **2x2
  grid of cinematic game cards** (metallic gold frames, rich card artwork) — the live game
  card carries the gold-and-fire football, the three "coming soon" cards are dimmed with a
  gold seal; bottom gold icon nav. Reference for card-grid screens.
- **Lobby / room browser** (`/rooms`, `/quick-play`, `/create-room`) — LOCKED 2026-06-26.
  Top bar with brand emblem + a create-room control; a **vertical list of gold-framed room
  cards** (player count, difficulty badge, join control, room code) over warm amber-gold
  night bokeh; bottom gold icon bar. Reference for list/row screens.
- **Auth** (`/login`, `/register`) — LOCKED 2026-06-26. **Cinematic emblem hero**: a
  dramatic gold-and-fire brand emblem + geometric gold logo mark at the top, a dark form
  panel with **gold-outlined input fields**, a prominent gold CTA, a muted secondary link;
  ember sparks. Reference for all form screens.
- **Bank** (`/bank`) — LOCKED 2026-06-26 (clean-panel variant). A central gold coin motif,
  a large balance number, a small trend/graph, and two gold action buttons (claim / etc.)
  on a calm gold-on-black panel. Reference for single-focus economy screens.
- **Rank** (`/rank`) — LOCKED 2026-06-26. An ornate gold-framed leaderboard: a trophy hero
  + top-three medal markers up top, then a dense list of ranked rows with gold numbers and
  avatars. Reference for leaderboard screens.
- **Stats** (`/stats`) — LOCKED 2026-06-26 (panel variant). A stack of gold-framed panels —
  stat rows with gold icons and numbers — over near-black, with a bottom CTA. Reference for
  dashboard/data screens.
- **Profile** (`/profile`) — LOCKED 2026-06-26. An avatar header (circular gold-framed
  avatar + name) over a tidy list of gold-framed rows, with gold buttons at the bottom.
  Reference for identity/settings screens.
- **Friends** (`/friends`) — LOCKED 2026-06-26. A dense list of gold-framed member rows
  (avatar, name, gold accents) — request rows above the friends list. Reference for
  social-list screens.
- **Guide** (`/guide`) — LOCKED 2026-06-26 (illustrated variant). A hero illustration up
  top, then concise gold rank rows with small footballer-card thumbnails. Reference for the
  rules / 9-hand-ranks teaching screen.

**The screen system is COMPLETE** — every core and secondary screen has a locked visual
reference in one consistent gold-on-black fire world, plus the brand mark (§8.10).

### 8.10 Brand mark
- **LOCKED reference 2026-06-26** (from the auth frame): a **geometric gold emblem /
  monogram** — angular, faceted, metallic gold on near-black, premium and crest-like. This
  is the platform/brand mark direction (used in brand bars, auth hero, loading, app icon).
  Final vector/lockup to be designed at implementation; this frame is the intent.
