---
title: "Garden of Life — Deep Analysis: Bugs, Game Design, UI, Animation, Efficiency"
project: "Age Well: Garden of Life"
team: CtrlAI
date: 2026-08-03
deadline: 2026-08-09
analysed_commit: null
codebase:
  - app/index.html      # 364 lines
  - app/game.js         # 1483 lines
  - app/styles.css      # 1333 lines
  - app/manifest.json   # 27 lines
  - design-system/design-tokens.css
  - design-system/design-system.html
verification_method: "Static read of all source files + live run at http://localhost:8765 in a 375x812 mobile viewport, with DOM/computed-style assertions via JS."
totals:
  critical: 9
  design: 10
  ui_a11y: 8
  animation: 9
  efficiency: 4
---

# Garden of Life — Deep Analysis

## How to read this document

Every finding has a stable ID (`BUG-01`, `GD-03`, …). Each carries:

- **Severity** — `critical` (game is broken) / `high` / `medium` / `low`
- **Status** — `verified-live` (observed running) / `verified-static` (read in source) / `proposal`
- **Location** — `file:line` where applicable
- **Fix** — the concrete change

Sections 1–5 are findings. Section 6 is the prioritised execution order. Section 7 lists sources.

---

## 0. Skill-library search result

A search of the available skill library for game-development, game-design, and gamification skills returned no relevant results. The only matches were `canvas-design` (static poster/PDF art) and `slack-gif-creator`. Neither applies.

Domain knowledge in this document is therefore sourced from the primary references in Section 7, applied against the actual code.

---

## 1. Critical bugs

These break gameplay, the economy, or core platform behaviour. Fix before anything else.

### BUG-01 — The memory game shows every tile face-up

- **Severity:** critical
- **Status:** verified-live
- **Location:** `app/styles.css:555`

`.tile svg { width:70%; height:70%; color:var(--foliage-shadow) }` renders the tile's icon unconditionally. There is no rule hiding it in the unflipped state — no face-down state exists anywhere in the stylesheet.

Live verification on an unflipped `.tile`:

```json
{ "tileClasses": "tile", "svgOpacity": "1", "svgVisibility": "visible", "svgDisplay": "block" }
```

**Impact:** Tile Matching is 13 of the 32 levels. All symbols are visible from the start, so the exercise requires zero memory. This is the most damaging single defect in the build.

**Fix:** Hide the icon by default; reveal only on `.flipped` / `.matched`.

```css
.tile svg { opacity: 0; transition: opacity 120ms var(--ease-gentle); }
.tile.flipped svg,
.tile.matched svg { opacity: 1; }
```

Then layer the 3D flip from `ANIM-03`.

---

### BUG-02 — Level difficulty parameters are never read

- **Severity:** critical
- **Status:** verified-live
- **Location:** `app/game.js:405-465` (defined), `app/game.js:1000`, `1083`, `1245`, `1355` (ignored)

`ISLANDS` defines `pairs`, `rounds`, and `sets` per level. None are consumed:

| Exercise | Level field | What the code actually uses | Location |
|---|---|---|---|
| Tile Match | `pairs: 4…7` | `TILE_SYMBOLS.slice(0, 8)` — always 8 | `game.js:1000` |
| Pattern | `rounds: 2…6` | `const PATTERN_ROUNDS = 4` | `game.js:1083` |
| Odd One Out | `rounds: 2…6` | `const ODD_ROUNDS = 4` | `game.js:1245` |
| Word Pairs | `sets: 2…6` | random pick of one 4-pair set | `game.js:1355` |

Only `level.coins` (`game.js:891`) and `level.label` (`game.js:927`) are read.

**Live verification:** Level 1 of Memory Meadow, "First steps", declares `pairs: 4`. It rendered **16 tiles and 8 footer dots** — the hardest board in the game, on the tutorial level. All 32 levels are identical in difficulty.

**Note:** `.workbuddy-ai/memory/2026-08-03.md:93` records "Difficulty scales per level: more tile pairs, longer patterns, more rounds, more word sets." This was never implemented. See `PROC-01`.

**Fix:** Thread `currentLevelRef.level` into each `init*` function and use its parameters.

---

### BUG-03 — Coins are consumed when the garden is full

- **Severity:** critical
- **Status:** verified-static
- **Location:** `app/game.js:662-671` → `app/game.js:673-685`

```js
function buySeed(seed) {
  if (state.coins < seed.cost) return;
  state.coins -= seed.cost;          // charged here
  ...
  plantSeed(seed.id);                // silently no-ops when full
  showNotif('success', 'buy-seed', `${seed.name} planted!`, ...);  // lies
}

function plantSeed(seedId) {
  if (state.plants.length >= GARDEN_SLOTS) return;   // silent
  ...
}
```

The player is charged, receives nothing, and is told it succeeded. The same silent-failure path is reachable from the free daily seed (`game.js:696`) and the exercise seed reward (`game.js:910`).

**Fix:** Guard before charging; surface a real message when the garden is full.

```js
function buySeed(seed) {
  if (state.coins < seed.cost) return;
  if (state.plants.length >= GARDEN_SLOTS) {
    showNotif('warn', 'garden-full', 'Your garden is full',
              'Harvest a bloomed plant to free a plot.', 'icon-garden');
    return;
  }
  state.coins -= seed.cost;
  ...
}
```

Apply the same guard at all three call sites. Pairs with `GD-01` (harvest loop) and `GD-03` (garden expansion).

---

### BUG-04 — Infinite coin farm via level replay

- **Severity:** critical
- **Status:** verified-static
- **Location:** `app/game.js:889-893`, gating logic at `app/game.js:528`

Completed nodes remain clickable (`locked = !completed && levelIdx > firstIncomplete`), which is correct — replay is desirable. But `completeExercise` awards the full reward every time:

```js
const rewardCoins = currentLevelRef ? currentLevelRef.level.coins : coins;
state.coins += rewardCoins;
```

Replaying the cheapest level indefinitely prints unlimited currency, which voids the entire economy.

**Fix:** Split first-clear from replay.

```js
const firstClear = !isLevelComplete(currentLevelRef.islandId, currentLevelRef.levelIdx);
const rewardCoins = firstClear ? level.coins : Math.max(1, Math.floor(level.coins * 0.25));
```

Show "Practice reward" on the completion card when `!firstClear`.

---

### BUG-05 — `100vh` overrides `100dvh`

- **Severity:** high
- **Status:** verified-static
- **Location:** `app/styles.css:72-73`, `app/styles.css:86-87`

```css
body { height:100dvh; height:100vh; }   /* 100vh wins — last declaration */
#app { height:100dvh; height:100vh; }
```

The declaration order is inverted. `100vh` is the fallback and must come **first** so `100dvh` can override it in supporting browsers. As written, the dvh value never applies and the bottom nav is pushed under the mobile Safari address bar.

**Fix:** Swap both pairs — `height:100vh;` then `height:100dvh;`.

---

### BUG-06 — Day boundary is UTC, not local time

- **Severity:** high
- **Status:** verified-static
- **Location:** `app/game.js:46-48`, consumed at `55`, `125`, `153`, `611`

```js
function todayStr() { return new Date().toISOString().slice(0, 10); }
```

`toISOString()` is always UTC. For a Singapore (UTC+8) audience the calendar day rolls over at **08:00 local**, not midnight. Streaks, plant wilting, and the free daily seed all reset mid-morning. `daysBetween` (`game.js:50`) inherits the same skew.

**Fix:**

```js
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
```

---

### BUG-07 — Exercise content repeats immediately

- **Severity:** high
- **Status:** verified-static
- **Location:** `app/game.js:1247-1252`, `1292`, `1348-1352`, `988-997`

| Pool | Size | Levels drawing on it | Behaviour |
|---|---|---|---|
| `ODD_SETS` | 4 | ~12 | `ODD_SETS[round % 4]` with `ODD_ROUNDS = 4` → **identical four questions in identical order, every session** |
| `WORD_PAIR_SETS` | 3 sets × 4 pairs | ~12 | random pick of one set |
| `TILE_SYMBOLS` | 8 | ~13 | all 8 used every time — same board composition always |
| `PATTERN_ITEMS` | 4 | ~9 | randomised sequences — **this one is fine** |

Only Pattern Sequence generates genuine variety.

**Fix:** Expand `ODD_SETS` to 20+, `WORD_PAIR_SETS` to 12+, `TILE_SYMBOLS` to 12+ (the icon `<defs>` already contains enough symbols). Track recently-served item IDs in state and exclude them from the next draw.

---

### BUG-08 — Biased shuffle

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/game.js:1003`, `app/game.js:1293`, `app/game.js:1361`

`sort(() => Math.random() - 0.5)` is a well-known non-uniform shuffle — the comparator is inconsistent, so the resulting permutation distribution is skewed and engine-dependent. In a memory game, board randomness is load-bearing.

**Fix:** One shared Fisher–Yates helper.

```js
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

---

### BUG-09 — The PWA cannot install

- **Severity:** high
- **Status:** verified-static
- **Location:** `app/manifest.json`, `app/game.js` (absence)

Three independent blockers:

1. **No service worker.** `grep -c serviceWorker app/game.js` → `0`. No registration, no caching, no offline capability.
2. **Icon files do not exist.** `manifest.json:12,18` reference `icons/icon-192.png` and `icons/icon-512.png`. `ls app/icons` → *No such file or directory*.
3. **`start_url` is wrong.** `manifest.json:5` is `/app/index.html`, but the server roots at `app/`, making the correct path `/index.html`.

**Impact:** No install prompt, no offline play. For an audience with patchy connectivity this is a substantive product gap, not a technicality.

**Fix:** Generate the two icons, correct `start_url`, add a cache-first service worker over the four static assets.

---

## 2. Game design & gamification

### GD-01 — The core loop dead-ends

- **Severity:** high
- **Status:** verified-static

The loop is: exercise → coins → seeds → garden. It terminates:

| Quantity | Value |
|---|---|
| Total seeds available | 6 |
| Total cost of every seed | 117 coins |
| Garden capacity | 12 plots (`game.js:299`) |
| Coins available from the level path alone | ~190 |
| Coin sinks after all seeds owned | **none** |

Within roughly fifteen minutes the player owns everything, the garden is permanently full and static, and coins stop meaning anything. Progression is the primary reason players return in a live-service loop; yours stops before the first retention checkpoint.

**Fix (highest-value addition in this document):** a **harvest loop**. A bloomed plant can be harvested — it yields an ingredient, awards coins, and frees the plot. This converts the 12-slot cap from a wall into a rotation, gives coins a permanent sink, and finally feeds the meal system (`GD-02`).

---

### GD-02 — Meal cards have no function

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/game.js:73-80`, `174-185`, `751-773`

Six meals unlock when the right plants coexist in the garden, then do nothing forever. They are display-only entries on the profile screen.

**Fix:** Give each a small standing effect — a streak-freeze token (`GD-04`), a 24-hour coin multiplier, an extra daily seed. Collection without utility is a single dopamine hit; collection with utility is a reason to plan.

---

### GD-03 — No coin sink and no garden growth

- **Severity:** high
- **Status:** proposal

**Fix:** Sell plot 13, 14, 15… on an escalating curve. It is the most legible endless sink in the genre and it directly relieves `BUG-03`.

---

### GD-04 — The streak punishes, contradicting the stated design

- **Severity:** high
- **Status:** verified-static
- **Location:** `app/game.js:143-146`

```js
} else {
  state.streak = 1;   // one missed day → total reset
}
```

`.workbuddy-ai/memory/2026-08-03.md:108` states the streak system is "gentle (never punishing)". The implementation is the punishing variant. Streak-reset anxiety is a documented failure mode, and it is especially wrong for an elderly audience — a missed day may mean illness, not disengagement.

**Fix:** A **streak freeze** token, auto-consumed on a single missed day, earned weekly or via meal cards. Never blame the player in the copy.

---

### GD-05 — The streak ladder terminates at 14 with no reward

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/game.js:712`, seed table `app/game.js:62-69`

```js
const nextMilestone = state.streak < 3 ? 3 : state.streak < 7 ? 7 : 14;
```

Past day 14 this is pinned at 14, so the progress bar sits at 100% permanently while still reading "Next reward at 14 days". No seed carries `streakRequired: 14` — the promised reward does not exist. Only `3` and `7` are real gates.

**Fix:** Extend the ladder (14 / 30 / 60 / 100) with a real reward at each, and handle the terminal case in the copy.

---

### GD-06 — No adaptive difficulty

- **Severity:** high
- **Status:** proposal

The research on games for older adults specifically identifies adaptive difficulty as the mechanism for handling the very wide variance in performance capability within this population. The build currently has neither adaptive difficulty **nor** a static curve (`BUG-02`).

**Fix:** Resolve `BUG-02` first to establish the static curve. Then track per-exercise-type accuracy and completion effort in state, and nudge parameters ±1 step. Never announce it; never let it read as demotion.

---

### GD-07 — All four islands unlock simultaneously

- **Severity:** medium
- **Status:** verified-live
- **Location:** `app/game.js:487-573`

Every island renders with an unlocked, pulsing level 1. The Duolingo path pattern derives its power from exactly one obvious next action; four competing entry points dissolve that.

**Fix:** Gate island *n+1* behind ~5 completed levels of island *n*. Show the locked island with its header visible and its path collapsed, so the player can see what is coming.

---

### GD-08 — No daily goal

- **Severity:** medium
- **Status:** verified-static

The free daily seed (`game.js:688-701`) is the only daily hook, and it is buried on the shop screen.

**Fix:** A visible "2 exercises today" ring in the top bar. Cheap to build, and it is the standard driver of the return visit.

---

### GD-09 — No first-time user experience

- **Severity:** high
- **Status:** verified-live

A new player sees twelve empty pots and a **disabled** "Water all plants" button. The sole guidance is one notification that fires 800ms after load and self-dismisses after 5s (`game.js:212-215`, `1462-1466`). Nothing points at the shop; nothing explains the loop.

The design notes specify "zero onboarding required" — but zero onboarding requires a self-evident first screen, and an empty grid is not one.

**Fix:** Pre-plant one pandan seedling at index 0 for new players, so the garden is never empty. Add a persistent (non-dismissing) hint card on the garden screen until the first exercise is completed.

---

### GD-10 — Save data is fragile and unversioned

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/game.js:10`, `29-42`

All state lives under one `localStorage` key, `garden-of-life-v1`. There is no schema version field, no migration path, and no export. A browser data clear silently destroys a 30-day streak, and any future shape change to `state` will corrupt existing saves — `loadState` shallow-merges over `DEFAULT_STATE` with no validation.

**Fix:** Add a `schemaVersion` field with a migration switch. Offer export/import as a copyable JSON string on the profile screen.

---

## 3. UI & accessibility

The design system is genuinely strong — the botanical palette, the Fraunces/Work Sans pairing, and the 3D path nodes all read as considered and premium. The defects are in the details, and several contradict the project's own stated UX floor.

### UI-01 — Contrast failure on `--text-muted`

- **Severity:** high
- **Status:** verified-static (computed)
- **Location:** `app/styles.css:33`, used at `199`, `566`, `762`, `1076`, `1273`, `1289`

`--text-muted: #958579` on `--bg-primary: #EEE9D9` computes to a contrast ratio of **2.72:1**, against the project's stated hard floor of 4.5:1.

| Element | Location | Consequence |
|---|---|---|
| **Inactive bottom-nav labels** | `styles.css:762` | Primary navigation fails contrast |
| Garden date subtitle | `styles.css:199` | — |
| Island progress counter | `styles.css:1076` | — |
| Node coin reward | `styles.css:1273` | — |

`.meal-card.locked { opacity: 0.45 }` (`styles.css:458`) compounds on already-muted text.

**Fix:** Darken `--text-muted` to approximately `#6B5D52` (≈4.6:1). Replace the `opacity` dim on locked cards with an explicit accessible colour pair.

---

### UI-02 — Text-size floor broadly violated

- **Severity:** high
- **Status:** verified-static

The project specifies body text ≥ 28px. Actual values:

| Selector | Location | Declared | Computed |
|---|---|---|---|
| `.node-type-tag` | `styles.css:1303` | `0.65rem` | **10.4px**, uppercase, letter-spaced |
| `.meal-card-ingredients` | `styles.css:477` | `0.8rem` | 12.8px |
| `.node-label` | `styles.css:1162` | `0.8rem` | 12.8px |
| `.shop-item-desc` | `styles.css:367` | `0.9rem` | 14.4px |
| `.exercise-intro-body` | `styles.css:901` | `1rem` | 16px |

A 10.4px uppercase letter-spaced tag is not legible for this audience under any reading of the requirement.

**Fix:** Establish a hard minimum of 16px for any text and 20px for anything instructional. Raise `html { font-size }` and let the rem scale carry the rest.

---

### UI-03 — Garden plots are unreachable by keyboard

- **Severity:** high
- **Status:** verified-static
- **Location:** `app/game.js:310-331`

Plots are created as `<div>` with `role="button"` and an `aria-label`, but **no `tabindex`** and no `keydown` handler. They cannot be reached by keyboard or switch control. Level nodes (`game.js:533`, `563-566`) handle this correctly — the garden simply missed it.

**Fix:** Use a real `<button>`, or add `tabindex="0"` plus Enter/Space handling to match the level-node implementation.

---

### UI-04 — `aria-selected` is never reset; nav tabs expose no name

- **Severity:** high
- **Status:** verified-live
- **Location:** `app/game.js:285-290`

```js
document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
...
navItem.setAttribute('aria-selected', 'true');   // never set to 'false' elsewhere
```

Only the CSS class is cleared. After two navigations, multiple tabs report `aria-selected="true"` to assistive technology.

Separately, the live accessibility tree renders all four as unnamed:

```
tab [ref_17]
tab [ref_18]
tab [ref_19]
tab [ref_20]
```

The visible `<span>` labels are not producing accessible names.

**Fix:** Set `aria-selected="false"` on every nav item in the clearing loop. Add an explicit `aria-label` to each tab button and `aria-hidden="true"` on the decorative `<svg>`.

---

### UI-05 — The level type tag overlaps the coin reward

- **Severity:** medium
- **Status:** verified-live
- **Location:** `app/styles.css:1295-1309` vs `app/game.js:552-555`

`.node-type-tag` is `position:absolute; bottom:-6px` relative to the whole `.level-node` column, which places it over the `.node-reward` line rendered after `.node-label`. Observed live: the "TILE MATCH" tag was visible; the coin reward beneath it was not.

**Fix:** Move the tag into normal flow above the label, or reserve bottom padding on `.level-node` for it.

---

### UI-06 — The bottom nav stays live during an exercise

- **Severity:** medium
- **Status:** verified-live
- **Location:** `app/index.html:292` (`role="dialog" aria-modal="true"`), `app/styles.css:497` vs `750`

`#screen-play` declares itself a modal dialog at `z-index:30`, but `.bottom-nav` sits outside `.screens` at `z-index:20` and remains visible and tappable. Mid-exercise progress is discarded silently — no confirmation, no resume.

**Fix:** Hide or disable the nav while `#screen-play` is active. If the player does leave, either persist partial progress or confirm first.

---

### UI-07 — `.path-connector` is dead CSS

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/styles.css:1228-1235`; `grep -c path-connector app/game.js` → `0`

The connector is fully styled but never instantiated. The result is a column of floating circles with no visual trail — the element that makes a path read as a *journey* is missing. See `ANIM-02`.

---

### UI-08 — An unused font family is downloaded

- **Severity:** low
- **Status:** verified-static
- **Location:** `app/index.html:12`, `app/styles.css:41`

`--font-label: 'Pinyon Script'` is declared and the family is fetched from Google Fonts, but `grep -c "var(--font-label)" app/styles.css` → `0`. A display font is being downloaded for nothing.

**Fix:** Drop Pinyon Script from the `<link>`, or apply it to plant labels as the design system intended.

---

## 4. Animation

This is where the largest perceived-quality gain sits. The current inventory is thin: falling water drops, confetti, a node pulse, a notification fade, and `:active` scale transforms. Everything else is a hard cut.

The governing principle: juice is non-functional — it does not change the rules, only how the game feels. Disney's squash-and-stretch and anticipation are the backbone, and animation paired with sound is roughly half the effect. The existing Web Audio tone system (`game.js:222-241`) is a real asset; most items below should be paired with a sound.

### ANIM-01 — Screen transitions (largest single win)

- **Severity:** high
- **Status:** proposal
- **Location:** `app/game.js:284-295`

`showScreen` toggles `display:none` → `display:flex`. Instant and jarring; it is the main reason the app reads as a prototype rather than a product.

**Fix:** A 220ms crossfade plus a 12px directional slide — forward navigation slides left, back slides right. Requires keeping the outgoing screen mounted for the duration.

---

### ANIM-02 — Level-path traversal (currently absent entirely)

- **Severity:** high
- **Status:** proposal
- **Location:** `app/game.js:482-573`, `973-983`

Completing a level returns the player to a completely static path. Nothing communicates that they moved. The sequence that should fire on return:

1. **Auto-scroll** to the newly unlocked node — `scrollIntoView({ behavior:'smooth', block:'center' })`.
2. **The completed node flips state** — checkmark badge scales in on `--ease-spring`, fill transitions to dark green.
3. **A connector line draws itself** from the completed node to the next, via SVG `stroke-dasharray` / `stroke-dashoffset` animation. This is what sells "I moved along a path", and it finally uses the dead `.path-connector` CSS from `UI-07`.
4. **The next node pops open** — desaturated → full colour, `scale(0.9 → 1.06 → 1)` on `--ease-spring`, then the existing pulse begins.
5. *Optional:* a small watering-can marker that physically travels the connector.

This is the specific "traversing a level" feel that is missing.

---

### ANIM-03 — Tile flip

- **Severity:** high
- **Status:** proposal
- **Depends on:** `BUG-01`

Once the face-down state exists, use a real 3D flip: `transform: rotateY(180deg)` on a wrapper with `transform-style: preserve-3d` and `backface-visibility: hidden`, ~300ms. On a match, a squash-and-stretch pulse plus a green flash; on a miss, a short horizontal shake before flipping back.

---

### ANIM-04 — Plant growth

- **Severity:** high
- **Status:** proposal
- **Location:** `app/game.js:84-121`, `301-344`

A plant's state change is an instant `innerHTML` swap. This is the emotional core of the product and it has no animation whatsoever.

**Fix:** On seed → sprout → grown → bloom: the stem scales from `transform-origin: bottom` over ~600ms with an overshoot ease; leaves fade and rotate in, staggered 80ms; the bloom circle scales from 0 on a spring. A bloom should read as an event.

**Blocked by `EFF-03`** — the current full-`innerHTML` re-render destroys in-flight transitions.

---

### ANIM-05 — Localised watering

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/game.js:245-258`

`triggerWaterAnimation` always spawns 20 full-screen drops, regardless of whether one plant or twelve were watered.

**Fix:** Tapping one plant drops 3–4 droplets **onto that plot**, the plant does a small relieved bounce, and the thirsty border fades out. Reserve the full-screen version for "Water all".

---

### ANIM-06 — Thirsty plants need motion

- **Severity:** medium
- **Status:** proposal
- **Location:** `app/styles.css:232`

A wilting plant gets only a static orange border — easy to miss on a small screen.

**Fix:** A slow droop-and-recover sway (3s cycle, ~2° rotation). Draws the eye without nagging, which matters for this audience.

---

### ANIM-07 — Coin fly-to-counter

- **Severity:** high
- **Status:** proposal
- **Location:** `app/game.js:386-391`

`updateCoinDisplay` snaps the number. No motion connects the reward to the counter.

**Fix:** Animate 3–5 coin glyphs from the reward chip along a bezier to the top-bar counter, then **count the number up** rather than snapping. This is the highest value-per-line-of-code juice available in any economy game.

---

### ANIM-08 — Staggered list entry

- **Severity:** medium
- **Status:** proposal
- **Location:** `app/game.js:604-660`, `705-774`, `525-569`

Shop items, meal cards, and level nodes all appear simultaneously.

**Fix:** Stagger 40ms apart with a 10px rise. The screen reads as composed rather than dumped.

---

### ANIM-09 — Reduced-motion handling is too blunt

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/styles.css:1321-1327`

```css
@media (prefers-reduced-motion: reduce) {
  *,*::before,*::after { animation-duration:0ms !important; transition-duration:0ms !important; }
}
```

A reasonable safety net today. But once `ANIM-03` and `ANIM-04` land, some animations carry *information* — a hard cut makes the reduced-motion experience confusing rather than calmer.

**Fix:** Degrade information-bearing animations to a fast crossfade (~100ms) rather than to zero.

---

### ANIM-10 — No haptics

- **Severity:** low
- **Status:** proposal

**Fix:** `navigator.vibrate(10)` on tap; a double-pulse on level complete. Free on Android and it materially improves perceived responsiveness on touch.

---

## 5. Efficiency

Runtime performance is **not** a problem here — a small DOM with animations on `transform` and `opacity` is the correct choice. The real inefficiencies are elsewhere.

### EFF-01 — No service worker

- **Severity:** high
- **Status:** verified-static

Every launch is a network launch. See `BUG-09`. For an audience with patchy connectivity this is the most significant efficiency issue in the project.

---

### EFF-02 — Four render-blocking font families, one unused

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/index.html:12`

Fraunces, Cormorant Garamond, Work Sans, and Pinyon Script are all requested. Pinyon Script is never applied (`UI-08`). `&display=swap` is correctly present.

**Fix:** Drop Pinyon Script, drop Cormorant Garamond if it is only a fallback, and subset the remaining weights.

---

### EFF-03 — Full `innerHTML` teardown on every render

- **Severity:** medium
- **Status:** verified-static
- **Location:** `app/game.js:301-344`, `604-660`, `705-774`

`renderGarden` rebuilds all 12 plots and re-parses 12 SVG strings on **every** water action. It is fine at this scale, but it destroys any in-flight CSS transition.

**This is a blocker for `ANIM-04`.** Restructure to targeted DOM updates **before** adding plant-growth animation, not after.

---

### EFF-04 — `plantSVG` shadows the global `state`

- **Severity:** low
- **Status:** verified-static
- **Location:** `app/game.js:86`

```js
function plantSVG(plant, size = 'full') {
  const s = SEEDS.find(...);
  const state = plant.state;   // shadows the module-level `state`
```

It works, but any future line in this function that intends the global `state` will silently read a string instead. Rename to `stage`.

---

## 6. Execution order

Sized against the 2026-08-09 deadline.

### Phase 1 — Must fix (~half a day)

| ID | Item |
|---|---|
| `BUG-01` | Tile face-down state |
| `BUG-02` | Wire up level difficulty parameters |
| `BUG-05` | `100vh` / `100dvh` order |
| `BUG-03` | Coin loss when garden is full |
| `BUG-06` | Local timezone in `todayStr` |
| `BUG-04` | First-clear vs. replay rewards |

### Phase 2 — High value, low cost (~one day)

| ID | Item |
|---|---|
| `ANIM-01` | Screen crossfade |
| `ANIM-02` | Path connector + auto-scroll + unlock pop |
| `ANIM-07` | Coin fly-to-counter |
| `UI-01` | Contrast fix on `--text-muted` |
| `UI-02` | Raise sub-12px type |
| `UI-03` | `tabindex` on garden plots |
| `UI-04` | `aria-selected` reset + tab names |

### Phase 3 — The additive features (remaining time)

| ID | Item |
|---|---|
| `ANIM-03` | Tile flip |
| `ANIM-04` | Plant growth *(requires `EFF-03` first)* |
| `GD-01` | Harvest loop |
| `GD-03` | Garden expansion as coin sink |
| `GD-04` | Streak freeze |
| `GD-06` | Adaptive difficulty |
| `BUG-07` | 3–4× more exercise content |

### Phase 4 — If time allows

| ID | Item |
|---|---|
| `BUG-09` / `EFF-01` | Service worker + real icon files |
| `GD-02` | Meal card effects |
| `GD-09` | FTUE |
| `GD-10` | Save versioning + export |

---

### PROC-01 — Project notes are out of sync with the code

- **Severity:** medium
- **Status:** verified-static
- **Location:** `.workbuddy-ai/memory/2026-08-03.md:93`, `:16`, `:108`

Three claims in the memory file are not true of the current build:

| Claim | Line | Reality |
|---|---|---|
| "Difficulty scales per level" | 93 | Never implemented — `BUG-02` |
| "147 automated QA checks, 0 UX floor violations" | 16 | Contrast and text-size floors are both violated — `UI-01`, `UI-02` |
| Streak system is "gentle (never punishing)" | 108 | One missed day resets to 1 — `GD-04` |

Correct these before the team plans around them.

---

## 7. Sources

Domain references used in this analysis:

- [Disney's 12 Animation Principles Applied to Games — GameJuice](https://gamejuice.co.uk/articles/disney-12-animation-principles-games)
- [Game feel on the web: squash, shake, and the art of juice](https://valdemird.com/blog/game-feel-on-the-web/)
- [Mobile Game Design Guide to Improve Gaming Experience for the Middle-Aged and Older Adult Population — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8176340/)
- [Supporting Aging Well through Accessible Digital Games — arXiv](https://arxiv.org/pdf/2506.07777)
- [Mobile Gaming for Cognitive Health in Older Adults: A Scoping Review — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12026782/)
- [Streak Design: 4 Rules Behind Duolingo's Loop — Yu-kai Chou](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/)
- [Crafting A Strong Core Loop — Mobile Free To Play](https://mobilefreetoplay.com/bible/crafting-strong-core-loop/)

---

## Appendix — Verification commands

```bash
# BUG-09: no service worker, no icons
grep -c "serviceWorker" app/game.js          # -> 0
ls app/icons                                  # -> No such file or directory

# UI-07: connector styled but never built
grep -c "path-connector" app/game.js          # -> 0

# UI-08 / EFF-02: font declared, never used
grep -c "var(--font-label)" app/styles.css    # -> 0

# UI-04: aria-selected never cleared
grep -c 'aria-selected., .false' app/game.js  # -> 0

# BUG-01: no rule hides an unflipped tile's icon
grep -n "\.tile" app/styles.css
```

Live DOM assertion used for `BUG-01` and `BUG-02`, run against `http://localhost:8765` at 375×812:

```js
const t = document.querySelector('.tile');
const cs = getComputedStyle(t.querySelector('svg'));
({ svgOpacity: cs.opacity, svgVisibility: cs.visibility,
   tileCount: document.querySelectorAll('.tile').length,
   dots: document.querySelectorAll('.round-dot').length });
// -> { svgOpacity:"1", svgVisibility:"visible", tileCount:16, dots:8 }
//    on level 1, which declares pairs:4
```
